import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { ASPECT_RATIO_DIMENSIONS } from "../data/presets";
import type { ExportProgress, ExportSettings, ProjectState } from "../types/studio";
import { renderProjectAudioMix } from "./audioSynth";
import {
  createMediaCache,
  getProjectDuration,
  renderFrame,
  type MediaCache,
} from "./canvasRenderer";

async function preloadAllMedia(project: ProjectState, cache: MediaCache): Promise<void> {
  const imageUrls = new Set<string>();
  const videoUrls = new Set<string>();
  for (const clip of project.clips) {
    if (clip.kind === "image" && clip.src) imageUrls.add(clip.src);
    if (clip.kind === "video" && clip.src) videoUrls.add(clip.src);
  }
  if (project.watermark.enabled && project.watermark.logoSrc) {
    imageUrls.add(project.watermark.logoSrc);
  }

  await Promise.all([
    ...Array.from(imageUrls).map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            cache.images.set(src, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        })
    ),
    ...Array.from(videoUrls).map(
      (src) =>
        new Promise<void>((resolve) => {
          const vid = document.createElement("video");
          vid.crossOrigin = "anonymous";
          vid.muted = true;
          vid.playsInline = true;
          vid.preload = "auto";
          vid.onloadeddata = () => {
            cache.videos.set(src, vid);
            resolve();
          };
          vid.onerror = () => resolve();
          vid.src = src;
          vid.load();
        })
    ),
  ]);
}

async function seekVideoPrecisely(vid: HTMLVideoElement, targetTime: number): Promise<void> {
  const clamped = Math.max(0, Math.min((vid.duration || 100) - 0.04, targetTime));
  if (Math.abs(vid.currentTime - clamped) < 0.015) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      vid.removeEventListener("seeked", finish);
      resolve();
    };
    vid.addEventListener("seeked", finish, { once: true });
    vid.currentTime = clamped;
    setTimeout(finish, 300);
  });
}

async function seekActiveVideosForTime(
  project: ProjectState,
  cache: MediaCache,
  time: number
) {
  const tasks: Promise<void>[] = [];
  for (const clip of project.clips) {
    if (clip.kind !== "video" || !clip.src) continue;
    if (time < clip.start || time > clip.start + clip.duration) continue;
    const vid = cache.videos.get(clip.src);
    if (!vid) continue;
    const localTime = (time - clip.start) * (clip.speed || 1) + (clip.trimStart || 0);
    tasks.push(seekVideoPrecisely(vid, localTime));
  }
  if (tasks.length > 0) await Promise.all(tasks);
}

async function pickSupportedAvcCodec(width: number, height: number, bitrate: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === "undefined") return null;
  const candidates = ["avc1.640028", "avc1.4d0028", "avc1.42001f", "avc1.42E01E"];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (support.supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

async function canEncodeAac(sampleRate: number): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
    return Boolean(res.supported);
  } catch {
    return false;
  }
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  duration: number;
  width: number;
  height: number;
}

/**
 * Exports the project to a genuine H.264 + AAC MP4 file using WebCodecs + mp4-muxer,
 * with automatic MediaRecorder fallback if WebCodecs is unavailable in the browser.
 */
export async function exportProjectToMp4(
  project: ProjectState,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const dims = ASPECT_RATIO_DIMENSIONS[project.aspectRatio];
  const rawW = settings.resolution === "1080p" ? dims.width : dims.hdWidth;
  const rawH = settings.resolution === "1080p" ? dims.height : dims.hdHeight;
  // H.264 requires even width/height
  const width = rawW % 2 === 0 ? rawW : rawW - 1;
  const height = rawH % 2 === 0 ? rawH : rawH - 1;
  const fps = settings.fps;
  const totalDuration = getProjectDuration(project);
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));

  const bitrateMap = {
    standard: settings.resolution === "1080p" ? 4_500_000 : 2_800_000,
    high: settings.resolution === "1080p" ? 8_000_000 : 5_000_000,
    ultra: settings.resolution === "1080p" ? 14_000_000 : 8_500_000,
  };
  const bitrate = bitrateMap[settings.quality];

  onProgress({
    phase: "preparing",
    progress: 2,
    currentFrame: 0,
    totalFrames,
    etaSeconds: Math.ceil(totalDuration),
  });

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const cache = createMediaCache();
  await preloadAllMedia(project, cache);

  if (signal?.aborted) throw new Error("رندر توسط کاربر لغو شد.");

  const avcCodec = await pickSupportedAvcCodec(width, height, bitrate, fps);

  if (avcCodec) {
    return exportWithWebCodecs({
      project,
      settings,
      width,
      height,
      fps,
      bitrate,
      totalDuration,
      totalFrames,
      avcCodec,
      cache,
      onProgress,
      signal,
    });
  }

  // Fallback for browsers without WebCodecs VideoEncoder
  return exportWithMediaRecorder({
    project,
    width,
    height,
    fps,
    bitrate,
    totalDuration,
    totalFrames,
    cache,
    onProgress,
    signal,
  });
}

async function exportWithWebCodecs(params: {
  project: ProjectState;
  settings: ExportSettings;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalDuration: number;
  totalFrames: number;
  avcCodec: string;
  cache: MediaCache;
  onProgress: (p: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<ExportResult> {
  const {
    project,
    settings,
    width,
    height,
    fps,
    bitrate,
    totalDuration,
    totalFrames,
    avcCodec,
    cache,
    onProgress,
    signal,
  } = params;

  const sampleRate = 48000;
  let mixedAudio: AudioBuffer | null = null;
  let enableAudioMux = false;

  if (settings.includeAudio) {
    onProgress({
      phase: "audio",
      progress: 6,
      currentFrame: 0,
      totalFrames,
      etaSeconds: Math.ceil(totalDuration),
    });
    const aacOk = await canEncodeAac(sampleRate);
    if (aacOk) {
      try {
        mixedAudio = await renderProjectAudioMix(project, totalDuration, sampleRate);
        if (mixedAudio) enableAudioMux = true;
      } catch {
        mixedAudio = null;
        enableAudioMux = false;
      }
    }
  }

  if (signal?.aborted) throw new Error("رندر توسط کاربر لغو شد.");

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height,
    },
    audio: enableAudioMux
      ? {
          codec: "aac",
          numberOfChannels: 2,
          sampleRate,
        }
      : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure({
    codec: avcCodec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (enableAudioMux && mixedAudio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("خطا در ایجاد بوم رندر ویدیو.");

  const frameDurationUs = Math.round(1_000_000 / fps);
  const startWall = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      try {
        videoEncoder.close();
        audioEncoder?.close();
      } catch {
        // ignore
      }
      throw new Error("رندر توسط کاربر لغو شد.");
    }
    if (encoderError) throw encoderError;

    const time = i / fps;
    await seekActiveVideosForTime(project, cache, time);

    renderFrame(ctx, project, {
      time,
      width,
      height,
      mediaCache: cache,
      isExport: true,
    });

    const timestampUs = i * frameDurationUs;
    const frame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: frameDurationUs,
    });

    const keyFrame = i % (fps * 2) === 0;
    videoEncoder.encode(frame, { keyFrame });
    frame.close();

    // Prevent encoder queue backpressure
    if (videoEncoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 8));
    }

    if (i % Math.max(1, Math.floor(fps / 3)) === 0 || i === totalFrames - 1) {
      const elapsedSec = Math.max(0.1, (performance.now() - startWall) / 1000);
      const fpsRate = (i + 1) / elapsedSec;
      const eta = Math.max(0, Math.ceil((totalFrames - i - 1) / Math.max(0.5, fpsRate)));
      const previewUrl = i % Math.max(1, fps) === 0 ? canvas.toDataURL("image/jpeg", 0.55) : undefined;
      onProgress({
        phase: "rendering",
        progress: Math.round(10 + ((i + 1) / totalFrames) * 76),
        currentFrame: i + 1,
        totalFrames,
        etaSeconds: eta,
        previewUrl,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress({
    phase: "muxing",
    progress: 89,
    currentFrame: totalFrames,
    totalFrames,
    etaSeconds: 1,
  });

  // Encode stereo planar audio chunks
  if (audioEncoder && mixedAudio) {
    const left = mixedAudio.getChannelData(0);
    const right = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : left;
    const chunkSize = 1024;
    for (let offset = 0; offset < left.length; offset += chunkSize) {
      const frames = Math.min(chunkSize, left.length - offset);
      const planar = new Float32Array(frames * 2);
      planar.set(left.subarray(offset, offset + frames), 0);
      planar.set(right.subarray(offset, offset + frames), frames);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: 2,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (encoderError) throw encoderError;

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });

  onProgress({
    phase: "done",
    progress: 100,
    currentFrame: totalFrames,
    totalFrames,
    etaSeconds: 0,
  });

  return {
    blob,
    mimeType: "video/mp4",
    extension: "mp4",
    duration: totalDuration,
    width,
    height,
  };
}

async function exportWithMediaRecorder(params: {
  project: ProjectState;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalDuration: number;
  totalFrames: number;
  cache: MediaCache;
  onProgress: (p: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<ExportResult> {
  const { project, width, height, fps, bitrate, totalDuration, totalFrames, cache, onProgress, signal } = params;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("خطا در ایجاد بوم رندر.");

  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
  const extension: "mp4" | "webm" = mimeType.includes("mp4") ? "mp4" : "webm";

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const donePromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);
  const startWall = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) {
      recorder.stop();
      throw new Error("رندر توسط کاربر لغو شد.");
    }
    const time = i / fps;
    await seekActiveVideosForTime(project, cache, time);
    renderFrame(ctx, project, {
      time,
      width,
      height,
      mediaCache: cache,
      isExport: true,
    });
    const targetWall = startWall + time * 1000;
    const waitMs = Math.max(0, targetWall - performance.now());
    if (waitMs > 1) await new Promise((r) => setTimeout(r, waitMs));

    if (i % Math.max(1, Math.floor(fps / 2)) === 0 || i === totalFrames - 1) {
      onProgress({
        phase: "rendering",
        progress: Math.round(((i + 1) / totalFrames) * 96),
        currentFrame: i + 1,
        totalFrames,
        etaSeconds: Math.max(0, Math.ceil(totalDuration - time)),
      });
    }
  }

  recorder.stop();
  const blob = await donePromise;

  onProgress({
    phase: "done",
    progress: 100,
    currentFrame: totalFrames,
    totalFrames,
    etaSeconds: 0,
  });

  return { blob, mimeType, extension, duration: totalDuration, width, height };
}
