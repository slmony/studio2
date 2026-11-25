import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportModal } from "./components/ExportModal";
import { InspectorPanel } from "./components/InspectorPanel";
import { LibrarySidebar, type SidebarTab } from "./components/LibrarySidebar";
import { PreviewStage } from "./components/PreviewStage";
import { ProjectsModal, ShortcutsModal } from "./components/StudioModals";
import { TimelinePanel } from "./components/TimelinePanel";
import { TopBar } from "./components/TopBar";
import {
  ASPECT_RATIO_DIMENSIONS,
  DEFAULT_COLOR_GRADE,
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  FILTER_PRESETS,
  INITIAL_STOCK_ASSETS,
  REEL_TEMPLATES,
  STOCK_VISUALS,
  makeClip,
} from "./data/presets";
import {
  LiveAudioPlayer,
  decodeAudioUrl,
  extractWaveformPeaks,
  getSynthWaveform,
} from "./engine/audioSynth";
import {
  createMediaCache,
  getProjectDuration,
  renderFrame,
} from "./engine/canvasRenderer";
import {
  deleteProjectFromLibrary,
  loadDraftProject,
  loadSavedProjects,
  saveDraftProject,
  saveProjectToLibrary,
} from "./engine/storage";
import type {
  AiCaptionSegment,
  AiScriptResult,
  AiStyleDirectorResult,
  AnimationType,
  AspectRatio,
  Clip,
  FilterPresetId,
  MediaAsset,
  ProjectState,
  ShapeKind,
  StickerId,
  SynthTrackId,
  TextStyleConfig,
  TimelineMarker,
  TransitionType,
} from "./types/studio";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function App() {
  const [project, setProject] = useState<ProjectState>(
    () => loadDraftProject() ?? REEL_TEMPLATES[0].build()
  );
  const [historyPast, setHistoryPast] = useState<ProjectState[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProjectState[]>([]);

  const [activeTab, setActiveTab] = useState<SidebarTab>("templates");
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(INITIAL_STOCK_ASSETS);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<ProjectState[]>(() => loadSavedProjects());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaCacheRef = useRef(createMediaCache());
  const audioPlayerRef = useRef(new LiveAudioPlayer());
  const toastTimerRef = useRef<number | null>(null);

  const totalDuration = useMemo(() => getProjectDuration(project), [project]);

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId) ?? null,
    [project.clips, selectedClipId]
  );

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2400);
  }, []);

  // Commit project mutation with 50-step Undo/Redo history
  const mutateProject = useCallback(
    (updater: (prev: ProjectState) => ProjectState, recordHistory = true) => {
      setProject((prev) => {
        const next = updater(prev);
        if (recordHistory) {
          setHistoryPast((past) => [...past.slice(-49), prev]);
          setHistoryFuture([]);
        }
        return { ...next, updatedAt: Date.now() };
      });
    },
    []
  );

  // Auto-save draft safely
  useEffect(() => {
    const id = window.setTimeout(() => saveDraftProject(project), 600);
    return () => window.clearTimeout(id);
  }, [project]);

  // Keep LiveAudioPlayer mute state synced
  useEffect(() => {
    audioPlayerRef.current.setMuted(isMuted);
  }, [isMuted]);

  // Playback loop (60fps requestAnimationFrame + live Web Audio sync)
  useEffect(() => {
    if (!isPlaying) {
      audioPlayerRef.current.stopAll();
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    let playingTime = currentTime >= totalDuration - 0.05 ? 0 : currentTime;
    if (playingTime === 0 && currentTime !== 0) {
      setCurrentTime(0);
    }

    audioPlayerRef.current.playFrom(project, playingTime);

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      playingTime += dt;

      if (playingTime >= totalDuration) {
        if (isLooping) {
          playingTime = 0;
          audioPlayerRef.current.playFrom(project, 0);
        } else {
          playingTime = totalDuration;
          setCurrentTime(totalDuration);
          setIsPlaying(false);
          return;
        }
      }

      setCurrentTime(Number(playingTime.toFixed(3)));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioPlayerRef.current.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isLooping, totalDuration]);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setProject((curr) => {
        setHistoryFuture((fut) => [curr, ...fut.slice(0, 49)]);
        return previous;
      });
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const next = fut[0];
      setProject((curr) => {
        setHistoryPast((past) => [...past.slice(-49), curr]);
        return next;
      });
      return fut.slice(1);
    });
  }, []);

  const handleSeek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(totalDuration + 4, t));
      setCurrentTime(clamped);
      if (isPlaying) {
        audioPlayerRef.current.playFrom(project, clamped);
      }
    },
    [totalDuration, isPlaying, project]
  );

  const handleStepFrame = useCallback(
    (delta: number) => {
      setIsPlaying(false);
      const step = 1 / project.fps;
      setCurrentTime((t) => Math.max(0, Math.min(totalDuration, Number((t + delta * step).toFixed(3)))));
    },
    [project.fps, totalDuration]
  );

  const handleUpdateClip = useCallback(
    (clipId: string, updater: (c: Clip) => Clip) => {
      mutateProject((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.id === clipId ? updater(c) : c)),
      }));
    },
    [mutateProject]
  );

  const handleDragClipTransform = useCallback(
    (clipId: string, x: number, y: number) => {
      mutateProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === clipId ? { ...c, transform: { ...c.transform, x, y } } : c
          ),
        }),
        false
      );
    },
    [mutateProject]
  );

  const handleUpdateClipTiming = useCallback(
    (clipId: string, start: number, duration: number, trimStart?: number) => {
      mutateProject(
        (p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id === clipId
              ? { ...c, start, duration, trimStart: trimStart ?? c.trimStart }
              : c
          ),
        }),
        false
      );
    },
    [mutateProject]
  );

  const handleSplitAtPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    if (currentTime <= clip.start + 0.15 || currentTime >= clip.start + clip.duration - 0.15) {
      notify("هد پخش باید درون بازه کلیپ انتخاب‌شده باشد.");
      return;
    }
    const leftDur = Number((currentTime - clip.start).toFixed(2));
    const rightDur = Number((clip.duration - leftDur).toFixed(2));
    const rightClip: Clip = {
      ...clip,
      id: uid("clip"),
      name: `${clip.name} (بخش ۲)`,
      start: Number(currentTime.toFixed(2)),
      duration: rightDur,
      trimStart: Number(((clip.trimStart || 0) + leftDur * (clip.speed || 1)).toFixed(2)),
      transitionIn: "none",
    };
    mutateProject((p) => ({
      ...p,
      clips: [
        ...p.clips.map((c) => (c.id === clip.id ? { ...c, duration: leftDur } : c)),
        rightClip,
      ],
    }));
    setSelectedClipId(rightClip.id);
    notify("کلیپ در محل هد پخش برش خورد.");
  }, [selectedClipId, project.clips, currentTime, mutateProject, notify]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedClipId) return;
    const clip = project.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const copy: Clip = {
      ...clip,
      id: uid("clip"),
      name: `${clip.name} (کپی)`,
      start: Number((clip.start + clip.duration + 0.1).toFixed(2)),
      transform: { ...clip.transform },
      color: { ...clip.color },
      textStyle: clip.textStyle ? { ...clip.textStyle } : undefined,
      audio: clip.audio ? { ...clip.audio } : undefined,
    };
    mutateProject((p) => ({ ...p, clips: [...p.clips, copy] }));
    setSelectedClipId(copy.id);
    notify("کلیپ تکثیر شد.");
  }, [selectedClipId, project.clips, mutateProject, notify]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedClipId) return;
    mutateProject((p) => ({
      ...p,
      clips: p.clips.filter((c) => c.id !== selectedClipId),
    }));
    setSelectedClipId(null);
    notify("کلیپ حذف شد.");
  }, [selectedClipId, mutateProject, notify]);

  const handleAddMarker = useCallback(() => {
    const marker = {
      id: uid("mk"),
      time: Number(currentTime.toFixed(2)),
      label: `نقطه ${project.markers.length + 1}`,
      color: "#38BDF8",
    };
    mutateProject((p) => ({ ...p, markers: [...p.markers, marker] }));
    notify("نشانگر ریتم به تایم‌لاین اضافه شد.");
  }, [currentTime, project.markers.length, mutateProject, notify]);

  const handleToggleTrackFlag = useCallback(
    (trackId: string, flag: "visible" | "locked" | "muted" | "solo") => {
      mutateProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, [flag]: !t[flag] } : t)),
      }));
    },
    [mutateProject]
  );

  const handleMoveTrackOrder = useCallback(
    (trackId: string, dir: -1 | 1) => {
      mutateProject((p) => {
        const idx = p.tracks.findIndex((t) => t.id === trackId);
        const nextIdx = idx + dir;
        if (idx < 0 || nextIdx < 0 || nextIdx >= p.tracks.length) return p;
        const copy = [...p.tracks];
        const [item] = copy.splice(idx, 1);
        copy.splice(nextIdx, 0, item);
        return { ...p, tracks: copy };
      });
    },
    [mutateProject]
  );

  // Full-resolution 1080p PNG Cover Snapshot
  const handleSnapshotCover = useCallback(() => {
    const dims = ASPECT_RATIO_DIMENSIONS[project.aspectRatio];
    const off = document.createElement("canvas");
    off.width = dims.width;
    off.height = dims.height;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, project, {
      time: currentTime,
      width: dims.width,
      height: dims.height,
      mediaCache: mediaCacheRef.current,
      isExport: true,
    });
    const url = off.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "_") || "reel"}_cover.png`;
    a.click();
    notify("کاور باکیفیت PNG دانلود شد.");
  }, [project, currentTime, notify]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSplitAtPlayhead();
      } else if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        handleAddMarker();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleStepFrame(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleStepFrame(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleDuplicateSelected,
    handleSplitAtPlayhead,
    handleAddMarker,
    handleDeleteSelected,
    handleStepFrame,
    selectedClipId,
  ]);

  // Add Media Upload (Video, Image, Audio)
  const handleUploadMediaFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const url = URL.createObjectURL(file);
        const cleanName = file.name.replace(/\.[^/.]+$/, "");

        if (file.type.startsWith("image/")) {
          const asset: MediaAsset = { id: uid("img"), name: cleanName, kind: "image", src: url };
          setMediaAssets((prev) => [asset, ...prev]);
          const videoTrack = project.tracks.find((t) => t.kind === "video") ?? project.tracks[0];
          const newClip = makeClip({
            id: uid("clip"),
            trackId: videoTrack.id,
            kind: "image",
            name: cleanName,
            src: url,
            start: Number(currentTime.toFixed(2)),
            duration: 4,
            kenBurns: "zoom-in",
            transitionIn: "dissolve",
          });
          mutateProject((p) => ({ ...p, clips: [...p.clips, newClip] }));
          setSelectedClipId(newClip.id);
          notify(`تصویر «${cleanName}» به تایم‌لاین اضافه شد.`);
        } else if (file.type.startsWith("video/")) {
          const dur = await new Promise<number>((resolve) => {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = () => resolve(Math.max(1, Math.min(60, v.duration || 6)));
            v.onerror = () => resolve(6);
            v.src = url;
          });
          const asset: MediaAsset = {
            id: uid("vid"),
            name: cleanName,
            kind: "video",
            src: url,
            duration: dur,
          };
          setMediaAssets((prev) => [asset, ...prev]);
          const videoTrack = project.tracks.find((t) => t.kind === "video") ?? project.tracks[0];
          const newClip = makeClip({
            id: uid("clip"),
            trackId: videoTrack.id,
            kind: "video",
            name: cleanName,
            src: url,
            start: Number(currentTime.toFixed(2)),
            duration: Number(dur.toFixed(2)),
            mediaDuration: dur,
            audio: { volume: 1, fadeIn: 0, fadeOut: 0, muted: false, eqPreset: "normal" },
          });
          mutateProject((p) => ({ ...p, clips: [...p.clips, newClip] }));
          setSelectedClipId(newClip.id);
          notify(`ویدیوی «${cleanName}» به تایم‌لاین اضافه شد.`);
        } else if (file.type.startsWith("audio/")) {
          let dur = 10;
          let waveform: number[] | undefined;
          try {
            const buf = await decodeAudioUrl(url);
            dur = Math.max(1, Math.min(60, buf.duration));
            waveform = extractWaveformPeaks(buf, 48);
          } catch {
            // fallback duration
          }
          const asset: MediaAsset = {
            id: uid("aud"),
            name: cleanName,
            kind: "audio",
            src: url,
            duration: dur,
            waveform,
          };
          setMediaAssets((prev) => [asset, ...prev]);
          const audioTrack =
            project.tracks.find((t) => t.kind === "audio") ?? project.tracks[project.tracks.length - 1];
          const newClip = makeClip({
            id: uid("clip"),
            trackId: audioTrack.id,
            kind: "audio",
            name: cleanName,
            src: url,
            start: Number(currentTime.toFixed(2)),
            duration: Number(dur.toFixed(2)),
            audio: {
              volume: 0.9,
              fadeIn: 0.3,
              fadeOut: 0.8,
              muted: false,
              eqPreset: "normal",
              waveform,
            },
          });
          mutateProject((p) => ({ ...p, clips: [...p.clips, newClip] }));
          setSelectedClipId(newClip.id);
          notify(`فایل صوتی «${cleanName}» اضافه شد.`);
        }
      }
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  const handleAddMediaAssetToTimeline = useCallback(
    (asset: MediaAsset) => {
      const videoTrack = project.tracks.find((t) => t.kind === "video") ?? project.tracks[0];
      const lastEnd = project.clips
        .filter((c) => c.trackId === videoTrack.id)
        .reduce((max, c) => Math.max(max, c.start + c.duration), 0);

      const newClip = makeClip({
        id: uid("clip"),
        trackId: videoTrack.id,
        kind: asset.kind === "video" ? "video" : "image",
        name: asset.name,
        src: asset.src,
        start: Number(lastEnd.toFixed(2)),
        duration: asset.duration ? Number(asset.duration.toFixed(2)) : 4,
        kenBurns: asset.kind === "image" ? "zoom-in" : "none",
        transitionIn: "dissolve",
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, newClip] }));
      setSelectedClipId(newClip.id);
      setCurrentTime(newClip.start);
      notify(`«${asset.name}» به انتهای لایه ویدیو اضافه شد.`);
    },
    [project.tracks, project.clips, mutateProject, notify]
  );

  const handleAddTextClip = useCallback(
    (presetStyle: Partial<TextStyleConfig>, isCaption = false, customText?: string) => {
      const textTrack = project.tracks.find((t) => t.kind === "text") ?? project.tracks[0];
      const newClip = makeClip({
        id: uid("txt"),
        trackId: textTrack.id,
        kind: isCaption ? "caption" : "text",
        name: isCaption ? "زیرنویس کارائوکه" : customText ? customText.slice(0, 18) : "متن جدید",
        start: Number(currentTime.toFixed(2)),
        duration: 3.5,
        transform: { ...DEFAULT_TRANSFORM, x: 0, y: isCaption ? 0.22 : -0.1 },
        enterAnimation: "slide-up",
        textStyle: {
          ...DEFAULT_TEXT_STYLE,
          ...presetStyle,
          text:
            customText ||
            (isCaption
              ? "زیرنویس پویای ریلز با هایلایت کلمه‌به‌کلمه"
              : "تیتر جذاب ریلز شما"),
        },
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, newClip] }));
      setSelectedClipId(newClip.id);
      notify(isCaption ? "زیرنویس پویا اضافه شد." : "لایه متن اضافه شد.");
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  const handleAddQuickCaptions = useCallback(
    (rawText: string) => {
      const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) return;
      const textTrack = project.tracks.find((t) => t.kind === "text") ?? project.tracks[0];
      let cursor = Number(currentTime.toFixed(2));
      const created: Clip[] = lines.map((line, i) => {
        const dur = Math.max(1.8, Math.min(4.5, line.split(/\s+/).length * 0.45 + 0.8));
        const clip = makeClip({
          id: uid(`cap${i}`),
          trackId: textTrack.id,
          kind: "caption",
          name: `زیرنویس ${i + 1}`,
          start: Number(cursor.toFixed(2)),
          duration: Number(dur.toFixed(2)),
          transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0.22 },
          enterAnimation: "fade",
          textStyle: {
            ...DEFAULT_TEXT_STYLE,
            text: line,
            fontSize: 50,
            fontWeight: 900,
            bgColor: "#0B0D11",
            bgOpacity: 0.62,
            highlightColor: "#F97316",
          },
        });
        cursor += dur + 0.1;
        return clip;
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, ...created] }));
      setSelectedClipId(created[0].id);
      notify(`${created.length} زیرنویس کارائوکه به تایم‌لاین اضافه شد.`);
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  const handleApplyFilter = useCallback(
    (presetId: FilterPresetId) => {
      const found = FILTER_PRESETS.find((f) => f.id === presetId);
      if (!found) return;
      const grade = { ...DEFAULT_COLOR_GRADE, ...found.grade, preset: presetId };
      mutateProject((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (selectedClipId) {
            return c.id === selectedClipId ? { ...c, color: grade } : c;
          }
          return c.kind === "image" || c.kind === "video" ? { ...c, color: grade } : c;
        }),
      }));
      notify(`فیلتر «${found.name}» اعمال شد.`);
    },
    [selectedClipId, mutateProject, notify]
  );

  const handleApplyTransition = useCallback(
    (transition: TransitionType) => {
      mutateProject((p) => ({
        ...p,
        clips: p.clips.map((c) => {
          if (selectedClipId) {
            return c.id === selectedClipId ? { ...c, transitionIn: transition } : c;
          }
          return c.kind === "image" || c.kind === "video" ? { ...c, transitionIn: transition } : c;
        }),
      }));
      notify("ترنزیشن روی صحنه اعمال شد.");
    },
    [selectedClipId, mutateProject, notify]
  );

  const handleAddStickerClip = useCallback(
    (stickerId: StickerId, label: string, accent: string) => {
      const gTrack = project.tracks.find((t) => t.kind === "graphic") ?? project.tracks[0];
      const clip = makeClip({
        id: uid("stk"),
        trackId: gTrack.id,
        kind: "sticker",
        name: label,
        stickerId,
        stickerLabel: label,
        stickerAccent: accent,
        start: Number(currentTime.toFixed(2)),
        duration: 3.5,
        transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0.2 },
        enterAnimation: "pop",
        loopAnimation: "pulse",
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, clip] }));
      setSelectedClipId(clip.id);
      notify(`استیکر «${label}» اضافه شد.`);
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  const handleAddShapeClip = useCallback(
    (shapeKind: ShapeKind) => {
      const gTrack = project.tracks.find((t) => t.kind === "graphic") ?? project.tracks[0];
      const clip = makeClip({
        id: uid("shp"),
        trackId: gTrack.id,
        kind: "shape",
        name: shapeKind === "gradient-scrim" ? "گرادیان تیره خوانایی" : "شکل گرافیکی",
        shapeKind,
        shapeFill: shapeKind === "gradient-scrim" ? "rgba(0,0,0,0)" : "#F97316",
        shapeFill2: "rgba(5,7,11,0.85)",
        start: Number(currentTime.toFixed(2)),
        duration: 4,
        transform: { ...DEFAULT_TRANSFORM, x: 0, y: shapeKind === "gradient-scrim" ? 0.25 : 0, opacity: 0.85 },
        enterAnimation: "fade",
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, clip] }));
      setSelectedClipId(clip.id);
      notify("شکل گرافیکی اضافه شد.");
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  const handleAddSynthAudio = useCallback(
    (synthId: SynthTrackId, name: string, duration: number) => {
      const audioTrack =
        project.tracks.find((t) => t.kind === "audio") ?? project.tracks[project.tracks.length - 1];
      const clipDur = synthId.startsWith("sfx-") ? duration : Math.min(duration, Math.max(8, totalDuration));
      const clip = makeClip({
        id: uid("syn"),
        trackId: audioTrack.id,
        kind: "audio",
        name,
        start: synthId.startsWith("sfx-") ? Number(currentTime.toFixed(2)) : 0,
        duration: Number(clipDur.toFixed(2)),
        audio: {
          volume: 0.85,
          fadeIn: synthId.startsWith("sfx-") ? 0 : 0.6,
          fadeOut: synthId.startsWith("sfx-") ? 0 : 1.0,
          muted: false,
          eqPreset: "normal",
          synthId,
          waveform: getSynthWaveform(synthId, clipDur),
        },
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, clip] }));
      setSelectedClipId(clip.id);
      notify(`صدای «${name}» به تایم‌لاین اضافه شد.`);
    },
    [project.tracks, currentTime, totalDuration, mutateProject, notify]
  );

  const handleAddRecordedVoiceover = useCallback(
    async (url: string, duration: number) => {
      let waveform: number[] | undefined;
      try {
        const buf = await decodeAudioUrl(url);
        waveform = extractWaveformPeaks(buf, 48);
      } catch {
        // ignore
      }
      const audioTrack =
        project.tracks.find((t) => t.kind === "audio") ?? project.tracks[project.tracks.length - 1];
      const clip = makeClip({
        id: uid("mic"),
        trackId: audioTrack.id,
        kind: "audio",
        name: "صدای گوینده (میکروفون)",
        src: url,
        start: Number(currentTime.toFixed(2)),
        duration,
        audio: {
          volume: 1.15,
          fadeIn: 0.1,
          fadeOut: 0.2,
          muted: false,
          eqPreset: "voice",
          waveform,
        },
      });
      mutateProject((p) => ({ ...p, clips: [...p.clips, clip] }));
      setSelectedClipId(clip.id);
      notify("صدای ضبط‌شده روی تایم‌لاین قرار گرفت.");
    },
    [project.tracks, currentTime, mutateProject, notify]
  );

  // AI Actions -> Direct Timeline Synthesis
  const handleApplyAiScript = useCallback(
    (script: AiScriptResult) => {
      const videoTrack = project.tracks.find((t) => t.kind === "video") ?? project.tracks[0];
      const graphicTrack = project.tracks.find((t) => t.kind === "graphic") ?? project.tracks[1];
      const textTrack = project.tracks.find((t) => t.kind === "text") ?? project.tracks[2];
      const audioTrack = project.tracks.find((t) => t.kind === "audio") ?? project.tracks[3];

      const validFilters = new Set(FILTER_PRESETS.map((f) => f.id));
      const validAnims = new Set(["fade", "slide-up", "pop", "zoom-in", "typewriter"]);
      const visualKeys = Object.keys(STOCK_VISUALS);

      let cursor = 0;
      const newClips: Clip[] = [];
      const markers: TimelineMarker[] = [];

      script.scenes.forEach((sc, idx) => {
        const dur = Math.max(2, Math.min(8, Number(sc.duration) || 3.5));
        const themeKey = STOCK_VISUALS[sc.visualTheme] ? sc.visualTheme : visualKeys[idx % visualKeys.length];
        const filterId = (validFilters.has(sc.filterPreset as FilterPresetId)
          ? sc.filterPreset
          : "cinematic-warm") as FilterPresetId;
        const fp = FILTER_PRESETS.find((f) => f.id === filterId);
        const anim = (validAnims.has(sc.animation) ? sc.animation : "slide-up") as AnimationType;

        markers.push({
          id: uid(`aim${idx}`),
          time: Number(cursor.toFixed(2)),
          label: `صحنه ${idx + 1}`,
          color: idx === 0 ? "#F97316" : "#38BDF8",
        });

        newClips.push(
          makeClip({
            id: uid(`aiv${idx}`),
            trackId: videoTrack.id,
            kind: "image",
            name: `صحنه ${idx + 1} · ${sc.headline.slice(0, 14)}`,
            src: STOCK_VISUALS[themeKey].src,
            start: Number(cursor.toFixed(2)),
            duration: dur,
            kenBurns: idx % 2 === 0 ? "zoom-in" : "pan-up",
            color: { ...DEFAULT_COLOR_GRADE, ...(fp?.grade ?? {}), preset: filterId },
            transitionIn: idx === 0 ? "fade-black" : "dissolve",
          })
        );

        newClips.push(
          makeClip({
            id: uid(`ait${idx}`),
            trackId: textTrack.id,
            kind: "text",
            name: sc.headline.slice(0, 20),
            start: Number((cursor + 0.1).toFixed(2)),
            duration: Number((dur - 0.2).toFixed(2)),
            transform: { ...DEFAULT_TRANSFORM, x: 0, y: -0.22 },
            enterAnimation: anim,
            textStyle: {
              ...DEFAULT_TEXT_STYLE,
              text: sc.headline,
              fontFamily: "Lalezar",
              fontSize: 78,
              color: "#FFFFFF",
              bgColor: idx === 0 ? "#F97316" : "#0B0D11",
              bgOpacity: idx === 0 ? 0.92 : 0.45,
            },
          })
        );

        newClips.push(
          makeClip({
            id: uid(`aic${idx}`),
            trackId: textTrack.id,
            kind: "caption",
            name: `زیرنویس ${idx + 1}`,
            start: Number((cursor + 0.2).toFixed(2)),
            duration: Number((dur - 0.3).toFixed(2)),
            transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0.22 },
            enterAnimation: "fade",
            textStyle: {
              ...DEFAULT_TEXT_STYLE,
              text: sc.caption,
              fontSize: 48,
              fontWeight: 800,
              bgColor: "#0B0D11",
              bgOpacity: 0.65,
              highlightColor: "#F97316",
            },
          })
        );

        cursor += dur;
      });

      // CTA sticker at final scene
      if (script.ctaText && cursor > 2.5) {
        newClips.push(
          makeClip({
            id: uid("aicta"),
            trackId: graphicTrack.id,
            kind: "sticker",
            name: "کال‌تواکشن هوشمند",
            stickerId: "follow-cta",
            stickerLabel: script.ctaText.slice(0, 28),
            stickerAccent: "#F97316",
            start: Number(Math.max(0, cursor - 3.2).toFixed(2)),
            duration: 3.1,
            transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0.31 },
            enterAnimation: "pop",
            loopAnimation: "pulse",
          })
        );
      }

      const validMusic: SynthTrackId[] = ["lofi-night", "cinema-ambient", "reels-pulse", "deep-bass"];
      const musicId = validMusic.includes(script.suggestedMusic as SynthTrackId)
        ? (script.suggestedMusic as SynthTrackId)
        : "reels-pulse";

      newClips.push(
        makeClip({
          id: uid("aiaud"),
          trackId: audioTrack.id,
          kind: "audio",
          name: "موزیک پیشنهادی هوش مصنوعی",
          start: 0,
          duration: Number(cursor.toFixed(2)),
          audio: {
            volume: 0.85,
            fadeIn: 0.5,
            fadeOut: 1.0,
            muted: false,
            eqPreset: "normal",
            synthId: musicId,
            waveform: getSynthWaveform(musicId, cursor),
          },
        })
      );

      mutateProject((p) => ({
        ...p,
        name: script.projectTitle || p.name,
        clips: newClips,
        markers,
      }));
      setCurrentTime(0);
      setSelectedClipId(newClips[0]?.id ?? null);
      notify("سناریو و تمام صحنه‌ها با موفقیت روی تایم‌لاین ساخته شدند!");
    },
    [project.tracks, mutateProject, notify]
  );

  const handleApplyAiCaptions = useCallback(
    (segments: AiCaptionSegment[]) => {
      const textTrack = project.tracks.find((t) => t.kind === "text") ?? project.tracks[0];
      const created: Clip[] = segments.map((seg, i) =>
        makeClip({
          id: uid(`aicap${i}`),
          trackId: textTrack.id,
          kind: "caption",
          name: `زیرنویس ${i + 1}`,
          start: Math.max(0, Number(seg.start.toFixed(2))),
          duration: Math.max(0.8, Number(seg.duration.toFixed(2))),
          transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0.22 },
          enterAnimation: "fade",
          textStyle: {
            ...DEFAULT_TEXT_STYLE,
            text: seg.text,
            fontSize: 50,
            fontWeight: 900,
            bgColor: "#0B0D11",
            bgOpacity: 0.62,
            highlightColor: "#F97316",
          },
        })
      );
      mutateProject((p) => ({
        ...p,
        clips: [...p.clips.filter((c) => c.kind !== "caption"), ...created],
      }));
      setSelectedClipId(created[0]?.id ?? null);
      notify(`${created.length} زیرنویس زمان‌بندی‌شده به تایم‌لاین اضافه شد.`);
    },
    [project.tracks, mutateProject, notify]
  );

  const handleApplyAiStyle = useCallback(
    (style: AiStyleDirectorResult) => {
      const fp = FILTER_PRESETS.find((f) => f.id === style.filterPreset) ?? FILTER_PRESETS[1];
      const accent = style.accentColor?.startsWith("#") ? style.accentColor : "#F97316";
      const textCol = style.textColor?.startsWith("#") ? style.textColor : "#FFFFFF";
      const validTransitions = new Set([
        "dissolve",
        "fade-black",
        "slide-left",
        "slide-up",
        "zoom-burst",
        "wipe",
        "flash-white",
        "spin",
      ]);
      const trans = (validTransitions.has(style.transition) ? style.transition : "dissolve") as TransitionType;

      mutateProject((p) => ({
        ...p,
        progressBar: { ...p.progressBar, color: accent },
        visualizer: { ...p.visualizer, color: accent },
        clips: p.clips.map((c) => {
          if (c.kind === "image" || c.kind === "video") {
            return {
              ...c,
              color: { ...DEFAULT_COLOR_GRADE, ...fp.grade, preset: fp.id },
              transitionIn: trans,
            };
          }
          if (c.kind === "text" || c.kind === "caption") {
            return {
              ...c,
              textStyle: c.textStyle
                ? {
                    ...c.textStyle,
                    fontFamily: style.fontFamily || c.textStyle.fontFamily,
                    color: textCol,
                    highlightColor: accent,
                  }
                : c.textStyle,
            };
          }
          return c;
        }),
      }));
      notify(`استایل «${style.styleName}» روی کل پروژه اعمال شد.`);
    },
    [mutateProject, notify]
  );

  return (
    <div dir="rtl" className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0D11] text-[#F1F5F9]">
      {/* 3-Zone Top Bar */}
      <TopBar
        projectName={project.name}
        onRename={(name) => mutateProject((p) => ({ ...p, name }), false)}
        aspectRatio={project.aspectRatio}
        onAspectRatioChange={(ratio: AspectRatio) => {
          mutateProject((p) => ({ ...p, aspectRatio: ratio }));
          notify(`نسبت تصویر به ${ASPECT_RATIO_DIMENSIONS[ratio].label} تغییر کرد.`);
        }}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveProject={() => {
          const list = saveProjectToLibrary(project);
          setSavedProjects(list);
          notify("پروژه در مرورگر ذخیره شد.");
        }}
        onOpenProjects={() => setProjectsOpen(true)}
        onSnapshotCover={handleSnapshotCover}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
      />

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Right Sidebar (RTL Start): Library, Templates, Media, Audio & AI Studio */}
        <LibrarySidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          mediaAssets={mediaAssets}
          onLoadTemplate={(id) => {
            const tpl = REEL_TEMPLATES.find((t) => t.id === id);
            if (!tpl) return;
            setIsPlaying(false);
            setCurrentTime(0);
            setSelectedClipId(null);
            mutateProject(() => tpl.build());
            notify(`قالب «${tpl.name}» بارگذاری شد.`);
          }}
          onUploadMediaFiles={handleUploadMediaFiles}
          onAddMediaAssetToTimeline={handleAddMediaAssetToTimeline}
          onAddTextClip={handleAddTextClip}
          onAddQuickCaptions={handleAddQuickCaptions}
          onApplyFilterToSelected={handleApplyFilter}
          onApplyTransitionToSelected={handleApplyTransition}
          onAddStickerClip={handleAddStickerClip}
          onAddShapeClip={handleAddShapeClip}
          onAddSynthAudio={handleAddSynthAudio}
          onAddRecordedVoiceover={handleAddRecordedVoiceover}
          onApplyAiScript={handleApplyAiScript}
          onApplyAiCaptions={handleApplyAiCaptions}
          onSaveSocialCaption={(caption) => {
            mutateProject((p) => ({ ...p, savedCaption: caption }), false);
            notify("کپشن در پروژه ذخیره شد (آماده کپی هنگام خروجی MP4).");
          }}
          onApplyAiStyle={handleApplyAiStyle}
          hasSelectedVisualClip={Boolean(selectedClip && selectedClip.kind !== "audio")}
        />

        {/* Center Stage: Live Interactive Canvas & Playback Controls */}
        <PreviewStage
          project={project}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          isLooping={isLooping}
          isMuted={isMuted}
          showSafeZone={showSafeZone}
          showGrid={showGrid}
          selectedClipId={selectedClipId}
          mediaCache={mediaCacheRef.current}
          canvasRef={canvasRef}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSeek={handleSeek}
          onStepFrame={handleStepFrame}
          onToggleLoop={() => setIsLooping((l) => !l)}
          onToggleMute={() => setIsMuted((m) => !m)}
          onToggleSafeZone={() => setShowSafeZone((s) => !s)}
          onToggleGrid={() => setShowGrid((g) => !g)}
          onSelectClip={setSelectedClipId}
          onDragClipTransform={handleDragClipTransform}
        />

        {/* Left Sidebar (RTL End): Context-Sensitive Properties Inspector */}
        <InspectorPanel
          project={project}
          selectedClip={selectedClip}
          onUpdateClip={handleUpdateClip}
          onUpdateProject={(updater) => mutateProject(updater)}
        />
      </div>

      {/* Bottom Multi-Track NLE Timeline */}
      <TimelinePanel
        project={project}
        currentTime={currentTime}
        totalDuration={totalDuration}
        selectedClipId={selectedClipId}
        snapEnabled={snapEnabled}
        onSeek={handleSeek}
        onSelectClip={setSelectedClipId}
        onUpdateClipTiming={handleUpdateClipTiming}
        onSplitAtPlayhead={handleSplitAtPlayhead}
        onDuplicateSelected={handleDuplicateSelected}
        onDeleteSelected={handleDeleteSelected}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        onAddMarker={handleAddMarker}
        onRemoveMarker={(id) =>
          mutateProject((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) }))
        }
        onToggleTrackFlag={handleToggleTrackFlag}
        onMoveTrackOrder={handleMoveTrackOrder}
      />

      {/* Modals */}
      <ExportModal
        open={exportOpen}
        project={project}
        onClose={() => setExportOpen(false)}
        onSnapshotCover={handleSnapshotCover}
      />

      <ProjectsModal
        open={projectsOpen}
        currentProject={project}
        savedProjects={savedProjects}
        onClose={() => setProjectsOpen(false)}
        onOpenProject={(proj) => {
          setIsPlaying(false);
          setCurrentTime(0);
          setSelectedClipId(null);
          mutateProject(() => proj);
          notify(`پروژه «${proj.name}» باز شد.`);
        }}
        onDeleteProject={(id) => {
          setSavedProjects(deleteProjectFromLibrary(id));
          notify("پروژه حذف شد.");
        }}
        onImportProjectJson={(proj) => {
          setIsPlaying(false);
          setCurrentTime(0);
          setSelectedClipId(null);
          mutateProject(() => proj);
          notify(`پروژه «${proj.name}» بارگذاری شد.`);
        }}
      />

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Crisp Transient Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-6 z-50 px-4 py-2.5 rounded-lg bg-[#1B212E] border border-[#F97316]/60 text-xs font-medium text-white shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
