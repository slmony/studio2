import type { AudioEqPreset, Clip, ProjectState, SynthTrackId } from "../types/studio";

const synthBufferCache = new Map<string, AudioBuffer>();
const urlBufferCache = new Map<string, AudioBuffer>();

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Generates deterministic, royalty-free stereo AudioBuffers for built-in music & SFX
 * using Web Audio math so they play cleanly and mux cleanly into exported MP4s.
 */
export function generateSynthBuffer(
  synthId: SynthTrackId,
  durationSeconds: number,
  sampleRate = 48000
): AudioBuffer {
  const dur = Math.max(0.3, Math.min(180, durationSeconds));
  const key = `${synthId}:${dur.toFixed(1)}:${sampleRate}`;
  const cached = synthBufferCache.get(key);
  if (cached) return cached;

  const length = Math.floor(dur * sampleRate);
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const buffer = offline.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  if (synthId === "lofi-night") {
    const bpm = 84;
    const beatDur = 60 / bpm;
    const chords = [
      [220, 261.63, 329.63, 392.0], // Am7
      [174.61, 220, 261.63, 329.63], // Fmaj7
      [196.0, 246.94, 293.66, 392.0], // G6
      [164.81, 196.0, 246.94, 329.63], // Em7
    ];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const beat = t / beatDur;
      const bar = Math.floor(beat / 4) % chords.length;
      const chord = chords[bar];
      const beatFrac = beat % 1;
      const barFrac = (beat % 4) / 4;

      // Warm electric piano pad
      let padL = 0;
      let padR = 0;
      const padEnv = Math.min(1, barFrac * 8) * Math.exp(-barFrac * 1.4);
      for (let n = 0; n < chord.length; n++) {
        const f = chord[n];
        padL += Math.sin(2 * Math.PI * f * t + Math.sin(t * 2.5) * 0.15) * 0.08 * padEnv;
        padR += Math.sin(2 * Math.PI * (f * 1.003) * t + Math.cos(t * 2.1) * 0.15) * 0.08 * padEnv;
      }

      // Soft kick on beats 0 & 2.5
      let kick = 0;
      const b4 = beat % 4;
      const kickPos = b4 < 0.35 ? b4 : b4 >= 2.5 && b4 < 2.85 ? b4 - 2.5 : -1;
      if (kickPos >= 0) {
        const kt = kickPos * beatDur;
        const kFreq = 110 * Math.exp(-kt * 24) + 42;
        kick = Math.sin(2 * Math.PI * kFreq * kt) * Math.exp(-kt * 12) * 0.42;
      }

      // Crisp soft snare on beats 1 & 3
      let snare = 0;
      const snarePos = b4 >= 1 && b4 < 1.25 ? b4 - 1 : b4 >= 3 && b4 < 3.25 ? b4 - 3 : -1;
      if (snarePos >= 0) {
        const st = snarePos * beatDur;
        const noise = Math.sin(i * 12.9898) * 43758.5453;
        const nVal = (noise - Math.floor(noise)) * 2 - 1;
        snare = nVal * Math.exp(-st * 28) * 0.16;
      }

      // Gentle hi-hat on 8th notes
      const hatPos = (beat * 2) % 1;
      let hat = 0;
      if (hatPos < 0.08) {
        const ht = (hatPos / 2) * beatDur;
        const noise = Math.sin(i * 78.233) * 43758.5453;
        hat = ((noise - Math.floor(noise)) * 2 - 1) * Math.exp(-ht * 70) * 0.05;
      }

      // Sub bass
      const bassF = chord[0] * 0.5;
      const bass = Math.sin(2 * Math.PI * bassF * t) * 0.18 * (1 - beatFrac * 0.25);

      left[i] = Math.tanh(padL + kick + snare + hat + bass);
      right[i] = Math.tanh(padR + kick + snare - hat * 0.6 + bass);
    }
  } else if (synthId === "cinema-ambient") {
    const roots = [110, 87.31, 98.0, 82.41];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const idx = Math.floor(t / 4) % roots.length;
      const f0 = roots[idx];
      const swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * (t / 8) - Math.PI / 2);
      const shimmer = Math.sin(2 * Math.PI * (f0 * 3) * t) * 0.06 * (0.5 + 0.5 * Math.sin(t * 1.4));
      const droneL =
        (Math.sin(2 * Math.PI * f0 * t) * 0.24 +
          Math.sin(2 * Math.PI * (f0 * 1.5) * t) * 0.14 +
          Math.sin(2 * Math.PI * (f0 * 2.005) * t) * 0.1 +
          shimmer) *
        swell;
      const droneR =
        (Math.sin(2 * Math.PI * (f0 * 1.002) * t) * 0.24 +
          Math.sin(2 * Math.PI * (f0 * 1.498) * t) * 0.14 +
          Math.sin(2 * Math.PI * (f0 * 2.0) * t) * 0.1 -
          shimmer) *
        swell;
      // Subtle heartbeat pulse every 2s
      const pt = t % 2;
      const pulse = pt < 0.25 ? Math.sin(2 * Math.PI * 52 * pt) * Math.exp(-pt * 14) * 0.22 : 0;
      left[i] = Math.tanh(droneL + pulse);
      right[i] = Math.tanh(droneR + pulse);
    }
  } else if (synthId === "reels-pulse") {
    // High-energy 130 BPM Commercial Groove — punchy on-beat transient kick, snappy clap/snare, crisp 16th hats, driving octave bass & energetic uplifting pluck/arp
    const bpm = 130;
    const beatDur = 60 / bpm;
    // Am -> F -> C -> G uplifting commercial progression
    const bassRoots = [110.0, 87.31, 130.81, 98.0];
    const chordPools = [
      [220.0, 261.63, 329.63, 440.0],
      [174.61, 220.0, 261.63, 349.23],
      [261.63, 329.63, 392.0, 523.25],
      [196.0, 246.94, 293.66, 392.0],
    ];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const beat = t / beatDur;
      const bar = Math.floor(beat / 4) % 4;
      const beatInBar = beat % 4;
      const beatFrac = beat % 1;
      const kt = beatFrac * beatDur;

      // 1. Ultra-tight punchy four-on-the-floor kick locked right on every beat
      const kickClick = Math.exp(-kt * 220) * 0.36;
      const kickBody =
        Math.sin(2 * Math.PI * (205 * Math.exp(-kt * 38) + 50) * kt) * Math.exp(-kt * 14);
      const kick = (kickBody * 0.7 + kickClick) * (beatFrac < 0.44 ? 1 : 0);

      // 2. Crisp snappy clap + tight snare crack on beats 2 & 4
      const b2 = beat % 2;
      let clap = 0;
      if (b2 >= 1 && b2 < 1.26) {
        const ct = (b2 - 1) * beatDur;
        const n1 = Math.sin(i * 45.164) * 43758.5453;
        const n2 = Math.sin((i + 17) * 71.933) * 29431.123;
        const noise = n1 - Math.floor(n1) + (n2 - Math.floor(n2)) - 1;
        const body = Math.sin(2 * Math.PI * 220 * ct) * Math.exp(-ct * 38) * 0.24;
        clap = noise * Math.exp(-ct * 26) * 0.4 + body;
      }

      // 3. Driving 16th-note hi-hats + crisp offbeat open hat (& of each beat)
      const step16 = Math.floor(beat * 4);
      const frac16 = (beat * 4) % 1;
      const nH = Math.sin(i * 93.713) * 43758.5453;
      const hatNoise = (nH - Math.floor(nH)) * 2 - 1;
      const isOffBeat = step16 % 4 === 2;
      const hatDecay = isOffBeat ? 18 : 68;
      const hatAmp = isOffBeat ? 0.19 : step16 % 2 === 0 ? 0.11 : 0.065;
      const hat = hatNoise * Math.exp(-(frac16 * beatDur * 0.25) * hatDecay * 4) * hatAmp;

      // 4. Tight sidechained driving octave bass locked to the kick groove
      const bassRoot = bassRoots[bar];
      const bassOct = step16 % 4 >= 2 ? bassRoot : bassRoot * 0.5;
      const sidechain = Math.min(1, beatFrac * 5.2);
      const bass =
        (Math.sin(2 * Math.PI * bassOct * t) * 0.34 +
          Math.sin(2 * Math.PI * bassOct * 2 * t) * 0.13 +
          Math.sin(2 * Math.PI * bassOct * 3 * t) * 0.045) *
        sidechain;

      // 5. Energetic uplifting chord pluck & rhythmic 16th synth arp
      const chord = chordPools[bar];
      const step8 = Math.floor(beat * 2) % 8;
      const frac8 = (beat * 2) % 1;
      const stabPattern = [1, 0, 1, 1, 0, 1, 1, 1];
      const stabActive = stabPattern[step8];
      const stabEnv = stabActive ? Math.exp(-frac8 * 7.8) : Math.exp(-frac8 * 15) * 0.22;
      const note = chord[(step8 + bar) % chord.length];
      const arpNote = chord[(step16 + bar) % chord.length] * 2;
      const arpEnv = Math.exp(-frac16 * 9.5) * 0.075;
      const synthL =
        ((Math.sin(2 * Math.PI * note * t) +
          0.42 * Math.sin(2 * Math.PI * note * 2 * t) +
          0.18 * Math.sin(2 * Math.PI * note * 3 * t) +
          0.24 * Math.sin(2 * Math.PI * chord[1] * t)) *
          0.145 *
          stabEnv) +
        Math.sin(2 * Math.PI * arpNote * t) * arpEnv;
      const synthR =
        ((Math.sin(2 * Math.PI * (note * 1.003) * t) +
          0.42 * Math.sin(2 * Math.PI * note * 2 * t) +
          0.18 * Math.sin(2 * Math.PI * note * 3 * t) +
          0.24 * Math.sin(2 * Math.PI * chord[2] * t)) *
          0.145 *
          stabEnv) +
        Math.sin(2 * Math.PI * (arpNote * 1.002) * t) * arpEnv;

      // 6. Energetic 16th snare/clap turnaround fill on beats 3.25..4 of every 4-bar phrase
      let fill = 0;
      if (Math.floor(beat / 4) % 4 === 3 && beatInBar >= 3.25) {
        fill = hatNoise * Math.exp(-(frac16 * 9.5)) * 0.25;
      }

      left[i] = Math.tanh(kick + clap + hat + fill + bass + synthL * 1.2);
      right[i] = Math.tanh(kick + clap - hat * 0.85 + fill + bass + synthR * 1.2);
    }
  } else if (synthId === "deep-bass") {
    const bpm = 108;
    const beatDur = 60 / bpm;
    const bassSeq = [55, 55, 65.41, 49];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const beat = t / beatDur;
      const beatFrac = beat % 1;
      const kt = beatFrac * beatDur;
      const kick = Math.sin(2 * Math.PI * (130 * Math.exp(-kt * 26) + 40) * kt) * Math.exp(-kt * 10) * 0.52;
      const bf = bassSeq[Math.floor(beat / 2) % bassSeq.length];
      const bass = (Math.sin(2 * Math.PI * bf * t) + 0.4 * Math.sin(2 * Math.PI * bf * 2 * t)) * 0.28 * Math.min(1, beatFrac * 4);
      const hiPos = (beat * 4) % 1;
      const n = Math.sin(i * 91.771) * 43758.5453;
      const hat = hiPos < 0.12 ? ((n - Math.floor(n)) * 2 - 1) * Math.exp(-hiPos * 28) * 0.08 : 0;
      left[i] = Math.tanh(kick + bass + hat);
      right[i] = Math.tanh(kick + bass - hat * 0.8);
    }
  } else if (synthId === "sfx-whoosh") {
    for (let i = 0; i < length; i++) {
      const p = i / length;
      const env = Math.sin(Math.PI * p) ** 1.8;
      const n = Math.sin(i * 19.193) * 43758.5453;
      const noise = (n - Math.floor(n)) * 2 - 1;
      const sweep = Math.sin(2 * Math.PI * (140 + 520 * p) * (i / sampleRate)) * 0.28;
      const val = (noise * 0.45 + sweep) * env;
      left[i] = val * (1 - p * 0.3);
      right[i] = val * (0.7 + p * 0.3);
    }
  } else if (synthId === "sfx-pop") {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const freq = 620 * Math.exp(-t * 28) + 180;
      const val = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 22) * 0.7;
      left[i] = val;
      right[i] = val;
    }
  } else if (synthId === "sfx-chime") {
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let val = 0;
      for (let k = 0; k < freqs.length; k++) {
        const dt = t - k * 0.08;
        if (dt > 0) {
          val += Math.sin(2 * Math.PI * freqs[k] * dt) * Math.exp(-dt * 4.5) * 0.22;
        }
      }
      left[i] = val;
      right[i] = val * 0.96;
    }
  } else {
    // sfx-drop
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const freq = 150 * Math.exp(-t * 2.2) + 32;
      const val = Math.tanh(Math.sin(2 * Math.PI * freq * t) * 1.8) * Math.exp(-t * 1.9) * 0.75;
      left[i] = val;
      right[i] = val;
    }
  }

  synthBufferCache.set(key, buffer);
  return buffer;
}

export async function decodeAudioUrl(src: string): Promise<AudioBuffer> {
  const cached = urlBufferCache.get(src);
  if (cached) return cached;
  const ctx = getAudioContext();
  const res = await fetch(src);
  const arr = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arr);
  urlBufferCache.set(src, decoded);
  return decoded;
}

export function extractWaveformPeaks(buffer: AudioBuffer, bars = 48): number[] {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bars));
  const peaks: number[] = [];
  let maxVal = 0.01;
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const start = i * step;
    const end = Math.min(data.length, start + step);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j]);
      if (abs > sum) sum = abs;
    }
    peaks.push(sum);
    if (sum > maxVal) maxVal = sum;
  }
  return peaks.map((p) => Math.max(0.12, Math.min(1, p / maxVal)));
}

export function getSynthWaveform(synthId: SynthTrackId, duration: number): number[] {
  const buf = generateSynthBuffer(synthId, duration, 24000);
  return extractWaveformPeaks(buf, 48);
}

export function applyEqNode(
  ctx: BaseAudioContext,
  preset: AudioEqPreset
): AudioNode {
  const filter = ctx.createBiquadFilter();
  if (preset === "voice") {
    filter.type = "peaking";
    filter.frequency.value = 2600;
    filter.Q.value = 1.2;
    filter.gain.value = 6.5;
  } else if (preset === "bass") {
    filter.type = "lowshelf";
    filter.frequency.value = 160;
    filter.gain.value = 8;
  } else if (preset === "radio") {
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 2.0;
  } else {
    filter.type = "allpass";
  }
  return filter;
}

/**
 * Renders the complete stereo mixed AudioBuffer for the entire timeline
 * via OfflineAudioContext — used by the MP4 Exporter to encode AAC audio!
 */
export async function renderProjectAudioMix(
  project: ProjectState,
  totalDuration: number,
  sampleRate = 48000
): Promise<AudioBuffer | null> {
  const anySolo = project.tracks.some((t) => t.solo);
  const trackMap = new Map(project.tracks.map((t) => [t.id, t]));

  const activeAudioClips: Clip[] = project.clips.filter((c) => {
    if (c.kind !== "audio" && c.kind !== "video") return false;
    if (c.audio?.muted) return false;
    const tr = trackMap.get(c.trackId);
    if (!tr || !tr.visible || tr.muted) return false;
    if (anySolo && !tr.solo) return false;
    if (c.kind === "audio" && !c.src && !c.audio?.synthId) return false;
    if (c.kind === "video" && !c.src) return false;
    return true;
  });

  if (activeAudioClips.length === 0) return null;

  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);
  let scheduledAny = false;

  for (const clip of activeAudioClips) {
    try {
      let buf: AudioBuffer | null = null;
      if (clip.audio?.synthId) {
        buf = generateSynthBuffer(clip.audio.synthId, Math.max(clip.duration, 1), sampleRate);
      } else if (clip.src) {
        buf = await decodeAudioUrl(clip.src);
      }
      if (!buf) continue;

      const source = offline.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = Math.max(0.25, Math.min(4, clip.speed || 1));

      const eq = applyEqNode(offline, clip.audio?.eqPreset ?? "normal");
      const gain = offline.createGain();

      const vol = Math.max(0, Math.min(2, clip.audio?.volume ?? 0.9));
      const fadeIn = Math.max(0, Math.min(clip.duration / 2, clip.audio?.fadeIn ?? 0));
      const fadeOut = Math.max(0, Math.min(clip.duration / 2, clip.audio?.fadeOut ?? 0));
      const startTime = Math.max(0, clip.start);
      const endTime = Math.min(totalDuration, clip.start + clip.duration);

      if (fadeIn > 0.02) {
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + fadeIn);
      } else {
        gain.gain.setValueAtTime(vol, startTime);
      }

      if (fadeOut > 0.02) {
        const foStart = Math.max(startTime + fadeIn, endTime - fadeOut);
        gain.gain.setValueAtTime(vol, foStart);
        gain.gain.linearRampToValueAtTime(0.001, endTime);
      }

      source.connect(eq);
      eq.connect(gain);
      gain.connect(offline.destination);

      const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
      const offset = Math.max(0, Math.min(buf.duration - 0.05, clip.trimStart || 0));
      const timelineDur = Math.max(0.05, endTime - startTime);
      const bufferDur = Math.min(buf.duration - offset, timelineDur * speed);
      source.start(startTime, offset, Math.max(0.05, bufferDur));
      scheduledAny = true;
    } catch {
      // Ignore video clips that have no audio track
    }
  }

  if (!scheduledAny) return null;
  return offline.startRendering();
}

/**
 * Lightweight real-time preview audio playback manager synced to playhead
 */
export class LiveAudioPlayer {
  private activeSources: AudioBufferSourceNode[] = [];
  private masterGain: GainNode | null = null;
  private isMuted = false;
  private playSessionId = 0;

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
  }

  stopAll() {
    this.playSessionId += 1;
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeSources = [];
  }

  async playFrom(project: ProjectState, fromTime: number) {
    this.stopAll();
    const sessionId = this.playSessionId;
    const callStartedMs = performance.now();

    const ctx = getAudioContext();
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.connect(ctx.destination);
    }
    this.masterGain.gain.value = this.isMuted ? 0 : 1;

    const anySolo = project.tracks.some((t) => t.solo);
    const trackMap = new Map(project.tracks.map((t) => [t.id, t]));

    const audioClips = project.clips.filter((c) => {
      if (c.kind !== "audio") return false;
      if (c.audio?.muted) return false;
      const tr = trackMap.get(c.trackId);
      if (!tr || !tr.visible || tr.muted) return false;
      if (anySolo && !tr.solo) return false;
      return c.start + c.duration > fromTime;
    });

    // Decode all needed buffers in parallel so scheduling is instantaneous and drift-free
    const resolved = await Promise.all(
      audioClips.map(async (clip) => {
        try {
          let buf: AudioBuffer | null = null;
          if (clip.audio?.synthId) {
            buf = generateSynthBuffer(clip.audio.synthId, Math.max(clip.duration, 1), ctx.sampleRate);
          } else if (clip.src) {
            buf = await decodeAudioUrl(clip.src);
          }
          return { clip, buf };
        } catch {
          return { clip, buf: null };
        }
      })
    );

    if (sessionId !== this.playSessionId) return;

    const decodeElapsedSec = Math.max(0, (performance.now() - callStartedMs) / 1000);
    const effectiveFrom = fromTime + decodeElapsedSec;
    const now = ctx.currentTime + 0.015;

    for (const { clip, buf } of resolved) {
      if (!buf) continue;
      if (clip.start + clip.duration <= effectiveFrom + 0.02) continue;

      try {
        const source = ctx.createBufferSource();
        source.buffer = buf;
        const speed = Math.max(0.25, Math.min(4, clip.speed || 1));
        source.playbackRate.value = speed;

        const eq = applyEqNode(ctx, clip.audio?.eqPreset ?? "normal");
        const gain = ctx.createGain();
        const vol = Math.max(0, Math.min(2, clip.audio?.volume ?? 0.9));

        const delay = Math.max(0, clip.start - effectiveFrom);
        const alreadyElapsed = Math.max(0, effectiveFrom - clip.start);
        const remaining = Math.max(0.05, clip.duration - alreadyElapsed);
        const offset = Math.min(
          Math.max(0, buf.duration - 0.05),
          (clip.trimStart || 0) + alreadyElapsed * speed
        );

        const startAt = now + delay;
        const fadeIn = Math.max(0, clip.audio?.fadeIn ?? 0);
        const fadeOut = Math.max(0, clip.audio?.fadeOut ?? 0);

        if (alreadyElapsed === 0 && fadeIn > 0.02) {
          gain.gain.setValueAtTime(0.001, startAt);
          gain.gain.linearRampToValueAtTime(vol, startAt + Math.min(fadeIn, remaining / 2));
        } else {
          gain.gain.setValueAtTime(vol, startAt);
        }

        if (fadeOut > 0.02 && remaining > fadeOut) {
          gain.gain.setValueAtTime(vol, startAt + remaining - fadeOut);
          gain.gain.linearRampToValueAtTime(0.001, startAt + remaining);
        }

        source.connect(eq);
        eq.connect(gain);
        gain.connect(this.masterGain);
        const bufferDur = Math.min(buf.duration - Math.max(0, offset), remaining * speed);
        source.start(startAt, Math.max(0, offset), Math.max(0.05, bufferDur));
        this.activeSources.push(source);
      } catch {
        // ignore playback scheduling error
      }
    }
  }
}
