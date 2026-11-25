export type AspectRatio = "9:16" | "4:5" | "1:1" | "16:9";

export type TrackKind = "video" | "text" | "graphic" | "audio";

export type ClipKind =
  | "video"
  | "image"
  | "text"
  | "caption"
  | "sticker"
  | "shape"
  | "audio";

export type FilterPresetId =
  | "none"
  | "cinematic-warm"
  | "neon-night"
  | "kodak-film"
  | "noir-bw"
  | "pastel-soft"
  | "golden-hour"
  | "nordic-cool"
  | "vhs-retro"
  | "magazine-sharp"
  | "dramatic";

export type TransitionType =
  | "none"
  | "dissolve"
  | "fade-black"
  | "slide-left"
  | "slide-up"
  | "zoom-burst"
  | "wipe"
  | "flash-white"
  | "spin";

export type AnimationType =
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-right"
  | "slide-left"
  | "pop"
  | "zoom-in"
  | "spin-in"
  | "typewriter";

export type LoopAnimationType =
  | "none"
  | "float"
  | "pulse"
  | "shake"
  | "slow-spin";

export type KenBurnsPreset =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up";

export type BlendMode =
  | "source-over"
  | "screen"
  | "multiply"
  | "overlay"
  | "soft-light";

export type FitMode = "cover" | "contain" | "blur-fill";

export type AudioEqPreset = "normal" | "voice" | "bass" | "radio";

export type SynthTrackId =
  | "lofi-night"
  | "cinema-ambient"
  | "reels-pulse"
  | "deep-bass"
  | "sfx-whoosh"
  | "sfx-pop"
  | "sfx-chime"
  | "sfx-drop";

export type StickerId =
  | "follow-cta"
  | "save-post"
  | "share-reel"
  | "new-badge"
  | "discount-50"
  | "heart-glow"
  | "fire-trend"
  | "star-award"
  | "arrow-down"
  | "location-pin"
  | "link-bio"
  | "sound-on";

export type ShapeKind = "rect" | "circle" | "line" | "gradient-scrim";

export interface ColorGrade {
  preset: FilterPresetId;
  brightness: number; // 0..200 (100 default)
  contrast: number; // 0..200 (100 default)
  saturation: number; // 0..200 (100 default)
  warmth: number; // -100..100 (0 default)
  hueRotate: number; // -180..180 (0 default)
  blur: number; // 0..30 px
  vignette: number; // 0..100
  grain: number; // 0..100
  scanlines: number; // 0..100
  glitch: number; // 0..100
  cameraShake: number; // 0..100
}

export interface ClipTransform {
  x: number; // normalized -0.5..0.5 offset from center
  y: number; // normalized -0.5..0.5 offset from center
  scale: number; // 0.1..3
  rotation: number; // degrees -180..180
  opacity: number; // 0..1
  flipX: boolean;
  flipY: boolean;
  borderRadius: number; // px
  borderWidth: number; // px
  borderColor: string;
  fitMode: FitMode;
  blendMode: BlendMode;
}

export interface WordTiming {
  word: string;
  start: number; // seconds relative to clip start
  end: number; // seconds relative to clip start
}

export interface TextStyleConfig {
  text: string;
  fontFamily: string;
  fontSize: number; // px at 1080 width reference
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  align: "right" | "center" | "left";
  color: string;
  useGradient: boolean;
  gradientTo: string;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string;
  bgOpacity: number; // 0..1
  bgPadding: number;
  bgRadius: number;
  shadowBlur: number;
  shadowColor: string;
  highlightColor: string; // for karaoke caption active word
  maxWidthRatio: number; // 0.3..0.95
  wordTimings?: WordTiming[];
}

export interface AudioConfig {
  volume: number; // 0..2 (1 = 100%)
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  muted: boolean;
  eqPreset: AudioEqPreset;
  synthId?: SynthTrackId;
  waveform?: number[];
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  start: number; // seconds
  duration: number; // seconds
  trimStart: number; // media offset seconds
  mediaDuration?: number;
  speed: number; // 0.25..4
  src?: string;
  transform: ClipTransform;
  color: ColorGrade;
  kenBurns: KenBurnsPreset;
  enterAnimation: AnimationType;
  exitAnimation: AnimationType;
  animationDuration: number; // seconds
  loopAnimation: LoopAnimationType;
  transitionIn: TransitionType;
  transitionDuration: number; // seconds
  textStyle?: TextStyleConfig;
  stickerId?: StickerId;
  stickerAccent?: string;
  stickerLabel?: string;
  shapeKind?: ShapeKind;
  shapeFill?: string;
  shapeFill2?: string;
  audio?: AudioConfig;
  linkedCaptionId?: string;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  solo: boolean;
}

export interface BackgroundConfig {
  mode: "solid" | "linear" | "radial" | "ambient";
  color1: string;
  color2: string;
  color3: string;
  angle: number;
}

export interface ProgressBarConfig {
  enabled: boolean;
  position: "top" | "bottom";
  height: number;
  color: string;
  trackColor: string;
}

export interface VisualizerConfig {
  enabled: boolean;
  style: "bars" | "wave" | "mirror";
  positionY: number; // 0.1..0.9
  color: string;
  barCount: number;
  intensity: number; // 0.2..2
}

export interface WatermarkConfig {
  enabled: boolean;
  handle: string;
  logoSrc?: string;
  corner: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  opacity: number;
  scale: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface ProjectState {
  id: string;
  name: string;
  updatedAt: number;
  aspectRatio: AspectRatio;
  fps: 24 | 30 | 60;
  background: BackgroundConfig;
  progressBar: ProgressBarConfig;
  visualizer: VisualizerConfig;
  watermark: WatermarkConfig;
  tracks: Track[];
  clips: Clip[];
  markers: TimelineMarker[];
  savedCaption?: string;
  needsAutoNarration?: boolean;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  src: string;
  duration?: number;
  waveform?: number[];
  isStock?: boolean;
}

export interface ExportSettings {
  resolution: "720p" | "1080p";
  fps: 24 | 30 | 60;
  quality: "standard" | "high" | "ultra";
  includeAudio: boolean;
}

export interface ExportProgress {
  phase: "preparing" | "audio" | "rendering" | "muxing" | "done" | "error";
  progress: number; // 0..100
  currentFrame: number;
  totalFrames: number;
  etaSeconds: number;
  previewUrl?: string;
  errorMessage?: string;
}

export interface AiScriptScene {
  headline: string;
  caption: string;
  duration: number;
  filterPreset: string;
  animation: string;
  visualTheme: string;
}

export interface AiScriptResult {
  projectTitle: string;
  hookText: string;
  ctaText: string;
  suggestedMusic: string;
  scenes: AiScriptScene[];
}

export interface AiCaptionSegment {
  start: number;
  duration: number;
  text: string;
}

export interface AiSocialKitResult {
  captions: Array<{ style: string; text: string }>;
  hashtags: string[];
  hooks: string[];
  coverTitles: string[];
}

export interface AiStyleDirectorResult {
  styleName: string;
  rationale: string;
  filterPreset: string;
  fontFamily: string;
  accentColor: string;
  textColor: string;
  transition: string;
  musicId: string;
}
