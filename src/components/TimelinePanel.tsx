import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Copy,
  Eye,
  EyeOff,
  Film,
  Headphones,
  Image as ImageIcon,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  Music,
  Plus,
  Redo2,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getSynthWaveform } from "../engine/audioSynth";
import type {
  Clip,
  MediaAsset,
  ProjectState,
  ShapeKind,
  StickerId,
  SynthTrackId,
  Track,
} from "../types/studio";

export type TimelineToolMode = "select" | "razor";

export type TimelineQuickAddItem =
  | { type: "asset"; asset: MediaAsset }
  | { type: "text-headline" }
  | { type: "text-caption" }
  | { type: "sticker"; stickerId: StickerId; label: string; accent: string }
  | { type: "shape"; shapeKind: ShapeKind }
  | { type: "synth"; synthId: SynthTrackId; name: string; duration: number };

interface TimelinePanelProps {
  project: ProjectState;
  mediaAssets: MediaAsset[];
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  snapEnabled: boolean;
  toolMode: TimelineToolMode;
  canUndo: boolean;
  canRedo: boolean;
  onChangeToolMode: (mode: TimelineToolMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (id: string | null) => void;
  onUpdateClipTiming: (clipId: string, start: number, duration: number, trimStart?: number) => void;
  onSplitAtPlayhead: () => void;
  onSplitAllAtPlayhead: () => void;
  onSplitClipAtTime: (clipId: string, cutTime: number) => void;
  onTrimSelectedToPlayhead: (side: "start" | "end") => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: (ripple?: boolean) => void;
  onToggleSnap: () => void;
  onAddMarker: () => void;
  onRemoveMarker: (id: string) => void;
  onToggleTrackFlag: (trackId: string, flag: "visible" | "locked" | "muted" | "solo") => void;
  onMoveTrackOrder: (trackId: string, dir: -1 | 1) => void;
  onAddTrack: (kind: Track["kind"]) => void;
  onDeleteTrack: (trackId: string) => void;
  onQuickAddToTrack: (trackId: string | null, item: TimelineQuickAddItem) => void;
  onUploadMediaToTrack: (files: FileList, trackId: string | null) => void;
}

const TRACK_COLORS: Record<Track["kind"], { bg: string; border: string; text: string }> = {
  video: { bg: "bg-[#1D3557]/85", border: "border-[#3B82F6]/60", text: "text-[#DBEAFE]" },
  graphic: { bg: "bg-[#422B12]/85", border: "border-[#F59E0B]/60", text: "text-[#FEF3C7]" },
  text: { bg: "bg-[#31214F]/85", border: "border-[#A855F7]/60", text: "text-[#F3E8FF]" },
  audio: { bg: "bg-[#10392E]/85", border: "border-[#10B981]/60", text: "text-[#D1FAE5]" },
};

type MenuState =
  | {
      kind: "add-clip";
      track: Track | null;
      top: number;
      left: number;
    }
  | {
      kind: "add-track";
      top: number;
      left: number;
    }
  | null;

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  project,
  mediaAssets,
  currentTime,
  totalDuration,
  selectedClipId,
  snapEnabled,
  toolMode,
  canUndo,
  canRedo,
  onChangeToolMode,
  onUndo,
  onRedo,
  onSeek,
  onSelectClip,
  onUpdateClipTiming,
  onSplitAtPlayhead,
  onSplitAllAtPlayhead,
  onSplitClipAtTime,
  onTrimSelectedToPlayhead,
  onDuplicateSelected,
  onDeleteSelected,
  onToggleSnap,
  onAddMarker,
  onRemoveMarker,
  onToggleTrackFlag,
  onMoveTrackOrder,
  onAddTrack,
  onDeleteTrack,
  onQuickAddToTrack,
  onUploadMediaToTrack,
}) => {
  const [pxPerSec, setPxPerSec] = useState(24);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lanesRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadRef = useRef<{ trackId: string | null; accept: string }>({
    trackId: null,
    accept: "video/*,image/*,audio/*",
  });

  const timelineLength = Math.max(totalDuration + 4, 16);
  const timelineWidthPx = Math.max(760, Math.round(timelineLength * pxPerSec));

  const dragOpRef = useRef<{
    mode: "move" | "trim-start" | "trim-end";
    clip: Clip;
    startClientX: number;
  } | null>(null);

  const selectedClip = useMemo(
    () => project.clips.find((c) => c.id === selectedClipId) ?? null,
    [project.clips, selectedClipId]
  );

  const canSplitSelected = Boolean(
    selectedClip &&
      currentTime > selectedClip.start + 0.12 &&
      currentTime < selectedClip.start + selectedClip.duration - 0.12
  );

  const hasUnlockedClipAtPlayhead = useMemo(() => {
    return project.clips.some((c) => {
      const tr = project.tracks.find((t) => t.id === c.trackId);
      if (tr?.locked) return false;
      return currentTime > c.start + 0.12 && currentTime < c.start + c.duration - 0.12;
    });
  }, [project.clips, project.tracks, currentTime]);

  const snapPoints = useMemo(() => {
    const pts = new Set<number>([0, currentTime]);
    for (const m of project.markers) pts.add(m.time);
    for (const c of project.clips) {
      pts.add(c.start);
      pts.add(c.start + c.duration);
    }
    return Array.from(pts);
  }, [project.clips, project.markers, currentTime]);

  const applySnap = (val: number, ignoreId?: string): number => {
    if (!snapEnabled) return Math.max(0, Math.round(val * 20) / 20);
    const threshold = 10 / pxPerSec;
    for (const p of snapPoints) {
      if (Math.abs(val - p) <= threshold) {
        if (ignoreId) {
          const self = project.clips.find((c) => c.id === ignoreId);
          if (self && (Math.abs(p - self.start) < 0.001 || Math.abs(p - (self.start + self.duration)) < 0.001)) {
            continue;
          }
        }
        return Math.max(0, Number(p.toFixed(2)));
      }
    }
    return Math.max(0, Math.round(val * 20) / 20);
  };

  const handleZoomToFit = () => {
    const viewportW = scrollRef.current?.clientWidth ?? 860;
    const target = Math.max(12, Math.min(160, Math.floor((viewportW - 36) / Math.max(8, totalDuration + 2))));
    setPxPerSec(target);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };

  const openFloatingMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    kind: "add-clip" | "add-track",
    track: Track | null = null
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = kind === "add-clip" ? 280 : 210;
    const menuHeight = kind === "add-clip" ? 310 : 190;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.left));
    const top = Math.max(12, rect.top - menuHeight - 8);
    if (kind === "add-clip") {
      setMenu({ kind: "add-clip", track, top, left });
    } else {
      setMenu({ kind: "add-track", top, left });
    }
  };

  const triggerFileUpload = (trackId: string | null, accept: string) => {
    setMenu(null);
    pendingUploadRef.current = { trackId, accept };
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const updateTimeFromEvent = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, clientX - rect.left);
      onSeek(Math.min(timelineLength, Number((x / pxPerSec).toFixed(2))));
    };
    updateTimeFromEvent(e.clientX);
    el.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent) => updateTimeFromEvent(ev.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startClipDrag = (
    e: React.PointerEvent,
    clip: Clip,
    mode: "move" | "trim-start" | "trim-end",
    locked: boolean
  ) => {
    e.stopPropagation();

    if (toolMode === "razor") {
      const lanesEl = lanesRef.current;
      if (lanesEl) {
        const rect = lanesEl.getBoundingClientRect();
        const clickedTime = Math.max(0, Number(((e.clientX - rect.left) / pxPerSec).toFixed(2)));
        onSplitClipAtTime(clip.id, clickedTime);
      }
      return;
    }

    onSelectClip(clip.id);
    if (locked) return;

    dragOpRef.current = { mode, clip, startClientX: e.clientX };

    const onMove = (ev: PointerEvent) => {
      const op = dragOpRef.current;
      if (!op) return;
      const dt = (ev.clientX - op.startClientX) / pxPerSec;
      const orig = op.clip;

      if (op.mode === "move") {
        const nextStart = applySnap(Math.max(0, orig.start + dt), orig.id);
        onUpdateClipTiming(orig.id, nextStart, orig.duration);
      } else if (op.mode === "trim-start") {
        const maxStart = orig.start + orig.duration - 0.3;
        const clampedStart = Math.max(0, Math.min(maxStart, applySnap(orig.start + dt, orig.id)));
        const delta = clampedStart - orig.start;
        const nextDur = Math.max(0.3, orig.duration - delta);
        const nextTrim = Math.max(0, (orig.trimStart || 0) + delta);
        onUpdateClipTiming(orig.id, clampedStart, Number(nextDur.toFixed(2)), Number(nextTrim.toFixed(2)));
      } else {
        const rawEnd = orig.start + orig.duration + dt;
        const snappedEnd = applySnap(Math.max(orig.start + 0.3, rawEnd), orig.id);
        const nextDur = Math.max(0.3, snappedEnd - orig.start);
        onUpdateClipTiming(orig.id, orig.start, Number(nextDur.toFixed(2)));
      }
    };

    const onUp = () => {
      dragOpRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const rulerTicks = useMemo(() => {
    const step = pxPerSec >= 90 ? 1 : pxPerSec >= 45 ? 2 : 5;
    const ticks: number[] = [];
    for (let s = 0; s <= Math.ceil(timelineLength); s += step) {
      ticks.push(s);
    }
    return ticks;
  }, [pxPerSec, timelineLength]);

  const trackIcon = (kind: Track["kind"]) => {
    if (kind === "video") return <Film className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />;
    if (kind === "text") return <Type className="w-3.5 h-3.5 text-[#C084FC] shrink-0" />;
    if (kind === "graphic") return <Sparkles className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />;
    return <Music className="w-3.5 h-3.5 text-[#34D399] shrink-0" />;
  };

  const displayTracks = [...project.tracks].reverse();

  return (
    <section className="h-[278px] shrink-0 bg-[#131720] border-t border-[#252D3D] flex flex-col select-none">
      {/* Hidden input for direct timeline media/audio upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadMediaToTrack(e.target.files, pendingUploadRef.current.trackId);
          }
        }}
      />

      {/* Timeline Advanced Editing Toolbar */}
      <div className="h-10 shrink-0 px-3 border-b border-[#252D3D] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {/* Select vs Razor Blade Tool Mode */}
          <div className="flex items-center bg-[#0D1017] p-0.5 rounded-md border border-[#252D3D]">
            <button
              type="button"
              onClick={() => onChangeToolMode("select")}
              title="ابزار انتخاب و جابجایی کلیپ (V)"
              className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
                toolMode === "select"
                  ? "bg-[#252D3D] text-white"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              <span>انتخاب</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeToolMode("razor")}
              title="ابزار تیغ برش مستقیم روی کلیپ‌ها (C)"
              className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
                toolMode === "razor"
                  ? "bg-[#F97316] text-white"
                  : "text-[#94A3B8] hover:text-white"
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>تیغ برش</span>
            </button>
          </div>

          <span className="h-4 w-px bg-[#252D3D] mx-0.5" aria-hidden="true" />

          {/* Split & Trim Controls */}
          <button
            type="button"
            onClick={onSplitAtPlayhead}
            disabled={!canSplitSelected && !hasUnlockedClipAtPlayhead}
            title="برش کلیپ در محل هد پخش (S)"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#E2E8F0] bg-[#1B212E] hover:bg-[#252D3D] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5 text-[#F97316]" />
            <span>برش هد</span>
          </button>

          <button
            type="button"
            onClick={onSplitAllAtPlayhead}
            disabled={!hasUnlockedClipAtPlayhead}
            title="برش همزمان تمام لایه‌های باز در محل هد پخش"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>برش همه</span>
          </button>

          <button
            type="button"
            onClick={() => onTrimSelectedToPlayhead("start")}
            disabled={!canSplitSelected}
            title="حذف ابتدای کلیپ تا هد پخش ([)"
            className="px-1.5 py-1 rounded-md text-[11px] font-mono-tabular text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            ابتدا [
          </button>

          <button
            type="button"
            onClick={() => onTrimSelectedToPlayhead("end")}
            disabled={!canSplitSelected}
            title="حذف انتهای کلیپ از هد پخش (])"
            className="px-1.5 py-1 rounded-md text-[11px] font-mono-tabular text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            ] انتها
          </button>

          <span className="h-4 w-px bg-[#252D3D] mx-0.5" aria-hidden="true" />

          {/* Duplicate / Delete / Ripple Delete */}
          <button
            type="button"
            onClick={onDuplicateSelected}
            disabled={!selectedClipId}
            title="تکثیر کلیپ انتخاب‌شده (Ctrl+D)"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>تکثیر</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteSelected(false)}
            disabled={!selectedClipId}
            title="حذف کلیپ انتخاب‌شده (Delete)"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#CBD5E1] hover:bg-red-500/15 hover:text-red-400 disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteSelected(true)}
            disabled={!selectedClipId}
            title="حذف و بستن فاصله بعدی‌ها (Shift+Delete)"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#CBD5E1] hover:bg-red-500/15 hover:text-red-300 disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span>حذف+جمع</span>
          </button>

          <span className="h-4 w-px bg-[#252D3D] mx-0.5" aria-hidden="true" />

          {/* Direct Add Clip Popover */}
          <button
            type="button"
            onClick={(e) => openFloatingMenu(e, "add-clip", null)}
            title="افزودن مستقیم ویدیو، عکس، متن یا صدا به تایم‌لاین"
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#F97316]/15 text-[#FB923C] border border-[#F97316]/40 hover:bg-[#F97316] hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن</span>
          </button>

          <button
            type="button"
            onClick={onAddMarker}
            title="افزودن نشانگر ریتم در زمان فعلی (M)"
            className="px-2 py-1 rounded-md text-[11px] font-medium text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>نشانگر</span>
          </button>

          <button
            type="button"
            onClick={onToggleSnap}
            title="چسبندگی مغناطیسی کلیپ‌ها"
            className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
              snapEnabled
                ? "bg-[#F97316]/20 text-[#FB923C]"
                : "text-[#94A3B8] hover:bg-[#1B212E] hover:text-white"
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>چسبندگی</span>
          </button>

          <span className="h-4 w-px bg-[#252D3D] mx-0.5" aria-hidden="true" />

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="بازگشت به مرحله قبل (Ctrl+Z)"
            className="p-1.5 rounded-md text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="انجام مجدد (Ctrl+Y)"
            className="p-1.5 rounded-md text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {project.markers.length > 0 && (
            <div className="hidden 2xl:flex items-center gap-1 border-r border-[#252D3D] pr-2 mr-1 overflow-x-auto max-w-[320px]">
              {project.markers.map((mk, idx) => {
                const isActive =
                  currentTime >= mk.time &&
                  (idx === project.markers.length - 1 || currentTime < project.markers[idx + 1].time);
                return (
                  <button
                    key={mk.id}
                    type="button"
                    onClick={() => onSeek(mk.time)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? "bg-[#1B212E] text-[#F97316]"
                        : "text-[#94A3B8] hover:text-white hover:bg-[#1B212E]/70"
                    }`}
                  >
                    {mk.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Zoom & Fit Controls */}
        <div className="flex items-center gap-1.5 text-xs text-[#94A3B8] shrink-0">
          <button
            type="button"
            onClick={handleZoomToFit}
            title="نمایش کل ویدیو در قاب تایم‌لاین"
            className="px-2 py-1 rounded text-[11px] bg-[#1B212E] hover:bg-[#252D3D] text-[#CBD5E1] flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Maximize2 className="w-3 h-3" />
            <span>کل</span>
          </button>
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.max(12, z - 10))}
            title="کوچک‌نمایی تایم‌لاین"
            className="p-1 rounded hover:bg-[#1B212E] hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={12}
            max={160}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-20 studio-slider"
            aria-label="بزرگ‌نمایی تایم‌لاین"
          />
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.min(160, z + 10))}
            title="بزرگ‌نمایی تایم‌لاین"
            className="p-1 rounded hover:bg-[#1B212E] hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono-tabular text-[11px] w-9 text-left">
            {Math.round((pxPerSec / 64) * 100)}%
          </span>
        </div>
      </div>

      {/* Main Split: Track Headers (Right in RTL) + Scrollable LTR Time Grid */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Track Control Column */}
        <div className="w-56 shrink-0 border-l border-[#252D3D] bg-[#10141C] flex flex-col">
          <div className="h-7 shrink-0 border-b border-[#252D3D] px-2.5 flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>لایه‌ها ({project.tracks.length})</span>
            <button
              type="button"
              onClick={(e) => openFloatingMenu(e, "add-track")}
              title="افزودن لایه جدید به تایم‌لاین"
              className="px-1.5 py-0.5 rounded bg-[#1B212E] hover:bg-[#F97316] text-[#CBD5E1] hover:text-white flex items-center gap-1 text-[10px] font-medium transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>لایه جدید</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E2534]">
            {displayTracks.map((track) => (
              <div
                key={track.id}
                className="h-11 px-2 flex items-center justify-between gap-1 hover:bg-[#161B26] transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {trackIcon(track.kind)}
                  <span
                    title={track.name}
                    className="text-[11px] font-medium text-[#CBD5E1] truncate"
                  >
                    {track.name}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => openFloatingMenu(e, "add-clip", track)}
                    title={`افزودن کلیپ جدید در لایه «${track.name}»`}
                    className="p-1 rounded text-[#94A3B8] hover:text-[#FB923C] hover:bg-[#F97316]/15 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrackFlag(track.id, "visible")}
                    title={track.visible ? "مخفی کردن لایه" : "نمایش لایه"}
                    className={`p-1 rounded ${
                      track.visible ? "text-[#94A3B8] hover:text-white" : "text-red-400 bg-red-500/10"
                    }`}
                  >
                    {track.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrackFlag(track.id, "locked")}
                    title={track.locked ? "باز کردن قفل لایه" : "قفل کردن لایه"}
                    className={`p-1 rounded ${
                      track.locked ? "text-[#F97316] bg-[#F97316]/15" : "text-[#94A3B8] hover:text-white"
                    }`}
                  >
                    {track.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  {track.kind === "audio" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onToggleTrackFlag(track.id, "muted")}
                        title="بی‌صدا"
                        className={`p-1 rounded ${
                          track.muted ? "text-red-400 bg-red-500/15" : "text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {track.muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleTrackFlag(track.id, "solo")}
                        title="پخش انفرادی (Solo)"
                        className={`p-1 rounded ${
                          track.solo ? "text-[#F59E0B] bg-[#F59E0B]/15" : "text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        <Headphones className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onMoveTrackOrder(track.id, 1)}
                        title="بالا بردن لایه"
                        className="p-0.5 rounded text-[#64748B] hover:text-white"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveTrackOrder(track.id, -1)}
                        title="پایین بردن لایه"
                        className="p-0.5 rounded text-[#64748B] hover:text-white"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteTrack(track.id)}
                    disabled={project.tracks.length <= 1}
                    title="حذف این لایه و کلیپ‌هایش"
                    className="p-1 rounded text-[#64748B] hover:text-red-400 hover:bg-red-500/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable LTR Time Ruler + Tracks Grid */}
        <div
          ref={scrollRef}
          dir="ltr"
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setPxPerSec((z) => Math.max(12, Math.min(160, z + (e.deltaY < 0 ? 8 : -8))));
            }
          }}
          className="flex-1 overflow-x-auto overflow-y-auto bg-[#0D1017] relative"
        >
          <div style={{ width: `${timelineWidthPx}px` }} className="relative min-h-full">
            {/* Time Ruler */}
            <div
              onPointerDown={handleRulerPointerDown}
              className="h-7 border-b border-[#252D3D] bg-[#131720] relative cursor-ew-resize sticky top-0 z-20"
            >
              {rulerTicks.map((sec) => (
                <div
                  key={sec}
                  style={{ left: `${sec * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 flex flex-col justify-between pointer-events-none"
                >
                  <span className="text-[10px] font-mono-tabular text-[#64748B] pl-1 pt-0.5">
                    {sec}s
                  </span>
                  <div className="w-px h-2 bg-[#334057]" />
                </div>
              ))}

              {/* Timeline Rhythm Markers */}
              {project.markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(marker.time);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onRemoveMarker(marker.id);
                  }}
                  title={`${marker.label} (${marker.time.toFixed(1)}s) — دابل‌کلیک برای حذف`}
                  style={{ left: `${marker.time * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 -translate-x-1/2 z-30 flex flex-col items-center group"
                >
                  <div
                    className="w-2.5 h-2.5 rotate-45 mt-1 border border-black/60"
                    style={{ backgroundColor: marker.color }}
                  />
                </button>
              ))}
            </div>

            {/* Track Lanes */}
            <div
              ref={lanesRef}
              onPointerMove={(e) => {
                if (toolMode !== "razor") {
                  if (hoverTime !== null) setHoverTime(null);
                  return;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverTime(Math.max(0, Number(((e.clientX - rect.left) / pxPerSec).toFixed(2))));
              }}
              onPointerLeave={() => {
                if (hoverTime !== null) setHoverTime(null);
              }}
              className={`divide-y divide-[#1A202D] relative ${
                toolMode === "razor" ? "cursor-crosshair" : ""
              }`}
            >
              {displayTracks.map((track) => {
                const trackClips = project.clips.filter((c) => c.trackId === track.id);
                const style = TRACK_COLORS[track.kind];
                return (
                  <div
                    key={track.id}
                    onClick={() => onSelectClip(null)}
                    className={`h-11 relative ${track.visible ? "" : "opacity-40"}`}
                  >
                    {trackClips.map((clip) => {
                      const left = clip.start * pxPerSec;
                      const width = Math.max(26, clip.duration * pxPerSec);
                      const isSelected = clip.id === selectedClipId;
                      const wave =
                        clip.kind === "audio"
                          ? clip.audio?.waveform ||
                            (clip.audio?.synthId ? getSynthWaveform(clip.audio.synthId, clip.duration) : [])
                          : [];

                      return (
                        <div
                          key={clip.id}
                          onPointerDown={(e) => startClipDrag(e, clip, "move", track.locked)}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          className={`absolute top-1.5 bottom-1.5 rounded-md border overflow-hidden flex items-center transition-shadow ${
                            toolMode === "razor"
                              ? "cursor-crosshair hover:brightness-125"
                              : track.locked
                                ? "cursor-not-allowed opacity-85"
                                : "cursor-grab active:cursor-grabbing"
                          } ${style.bg} ${
                            isSelected
                              ? "border-[#F97316] ring-1 ring-[#F97316] z-10"
                              : `${style.border} hover:brightness-110`
                          }`}
                        >
                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => startClipDrag(e, clip, "trim-start", track.locked)}
                            className={`w-2 h-full shrink-0 z-10 ${
                              toolMode === "razor"
                                ? "cursor-crosshair"
                                : "cursor-col-resize hover:bg-[#F97316]/60"
                            }`}
                          />

                          {/* Thumbnail or Audio Waveform inside clip */}
                          <div className="flex-1 min-w-0 h-full relative flex items-center px-1.5 overflow-hidden">
                            {clip.kind === "image" && clip.src && (
                              <img
                                src={clip.src}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-6 h-6 rounded object-cover mr-1.5 shrink-0 opacity-90"
                              />
                            )}
                            {clip.kind === "audio" && wave.length > 0 && (
                              <div className="absolute inset-x-1 inset-y-1 flex items-end gap-[2px] opacity-35 pointer-events-none">
                                {wave.map((amp, wi) => (
                                  <div
                                    key={wi}
                                    className="flex-1 bg-[#34D399] rounded-t-[1px]"
                                    style={{ height: `${Math.round(amp * 100)}%` }}
                                  />
                                ))}
                              </div>
                            )}
                            <span
                              dir="rtl"
                              className={`text-[11px] font-medium truncate relative z-10 ${style.text}`}
                            >
                              {clip.name}
                            </span>
                          </div>

                          {/* Right Trim Handle */}
                          <div
                            onPointerDown={(e) => startClipDrag(e, clip, "trim-end", track.locked)}
                            className={`w-2 h-full shrink-0 z-10 ${
                              toolMode === "razor"
                                ? "cursor-crosshair"
                                : "cursor-col-resize hover:bg-[#F97316]/60"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Razor Hover Cut Guide */}
              {toolMode === "razor" && hoverTime !== null && (
                <div
                  style={{ left: `${hoverTime * pxPerSec}px` }}
                  className="absolute top-0 bottom-0 w-px border-l border-dashed border-[#FB923C] z-20 pointer-events-none"
                >
                  <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-[#F97316] text-[10px] font-mono-tabular text-white whitespace-nowrap">
                    {hoverTime.toFixed(2)}s
                  </span>
                </div>
              )}
            </div>

            {/* Playhead Needle */}
            <div
              style={{ left: `${currentTime * pxPerSec}px` }}
              className="absolute top-0 bottom-0 w-px bg-[#F97316] z-30 pointer-events-none"
            >
              <div className="w-3 h-3 -ml-[5.5px] bg-[#F97316] rounded-b-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Unclipped Floating Quick-Add Menus */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          {menu.kind === "add-track" ? (
            <div
              dir="rtl"
              style={{ top: `${menu.top}px`, left: `${menu.left}px` }}
              className="fixed z-50 w-52 rounded-lg bg-[#161B26] border border-[#2C3549] shadow-2xl p-1.5 space-y-1"
            >
              <div className="px-2 py-1 text-[11px] font-semibold text-[#94A3B8]">
                افزودن لایه جدید
              </div>
              <button
                type="button"
                onClick={() => {
                  onAddTrack("video");
                  setMenu(null);
                }}
                className="w-full px-2.5 py-1.5 rounded text-xs text-[#E2E8F0] hover:bg-[#252D3D] flex items-center gap-2 transition-colors"
              >
                <Film className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>لایه ویدیو / تصویر</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddTrack("text");
                  setMenu(null);
                }}
                className="w-full px-2.5 py-1.5 rounded text-xs text-[#E2E8F0] hover:bg-[#252D3D] flex items-center gap-2 transition-colors"
              >
                <Type className="w-3.5 h-3.5 text-[#C084FC]" />
                <span>لایه متن / زیرنویس</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddTrack("graphic");
                  setMenu(null);
                }}
                className="w-full px-2.5 py-1.5 rounded text-xs text-[#E2E8F0] hover:bg-[#252D3D] flex items-center gap-2 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" />
                <span>لایه گرافیک / استیکر</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddTrack("audio");
                  setMenu(null);
                }}
                className="w-full px-2.5 py-1.5 rounded text-xs text-[#E2E8F0] hover:bg-[#252D3D] flex items-center gap-2 transition-colors"
              >
                <Music className="w-3.5 h-3.5 text-[#34D399]" />
                <span>لایه صدا / موسیقی</span>
              </button>
            </div>
          ) : (
            <div
              dir="rtl"
              style={{ top: `${menu.top}px`, left: `${menu.left}px` }}
              className="fixed z-50 w-72 max-h-[310px] overflow-y-auto rounded-lg bg-[#161B26] border border-[#2C3549] shadow-2xl p-2 space-y-2"
            >
              <div className="flex items-center justify-between px-1 pb-1 border-b border-[#252D3D]">
                <span className="text-[11px] font-semibold text-white truncate">
                  {menu.track ? `افزودن به «${menu.track.name}»` : "افزودن سریع به تایم‌لاین"}
                </span>
                <span className="text-[10px] font-mono-tabular text-[#F97316]">
                  @{currentTime.toFixed(1)}s
                </span>
              </div>

              {/* Visual options */}
              {(!menu.track || menu.track.kind === "video") && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => triggerFileUpload(menu.track?.id ?? null, "video/*,image/*")}
                    className="w-full px-2.5 py-1.5 rounded bg-[#1D3557]/60 hover:bg-[#1D3557] text-xs font-medium text-[#DBEAFE] flex items-center gap-2 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>آپلود ویدیو یا تصویر از سیستم...</span>
                  </button>
                  <div className="text-[10px] text-[#64748B] px-1 pt-1">رسانه‌های آماده پروژه:</div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {mediaAssets
                      .filter((a) => a.kind === "image" || a.kind === "video")
                      .slice(0, 10)
                      .map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => {
                            onQuickAddToTrack(menu.track?.id ?? null, { type: "asset", asset });
                            setMenu(null);
                          }}
                          className="w-full px-2 py-1 rounded text-[11px] text-[#CBD5E1] hover:bg-[#252D3D] flex items-center gap-2 text-right transition-colors"
                        >
                          <ImageIcon className="w-3 h-3 text-[#60A5FA] shrink-0" />
                          <span className="truncate">{asset.name}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Text options */}
              {(!menu.track || menu.track.kind === "text") && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, { type: "text-headline" });
                      setMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-xs text-[#F3E8FF] bg-[#31214F]/60 hover:bg-[#31214F] flex items-center gap-2 transition-colors"
                  >
                    <Type className="w-3.5 h-3.5 text-[#C084FC]" />
                    <span>تیتر تبلیغاتی جدید</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, { type: "text-caption" });
                      setMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-xs text-[#F3E8FF] bg-[#31214F]/60 hover:bg-[#31214F] flex items-center gap-2 transition-colors"
                  >
                    <Type className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>زیرنویس کارائوکه کلمه‌به‌کلمه</span>
                  </button>
                </div>
              )}

              {/* Graphic options */}
              {(!menu.track || menu.track.kind === "graphic") && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, {
                        type: "sticker",
                        stickerId: "follow-cta",
                        label: "همین الان سفارش بده!",
                        accent: "#F97316",
                      });
                      setMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-xs text-[#FEF3C7] bg-[#422B12]/60 hover:bg-[#422B12] flex items-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" />
                    <span>استیکر کال‌تواکشن</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, {
                        type: "sticker",
                        stickerId: "new-badge",
                        label: "تضمین کیفیت و نصب",
                        accent: "#10B981",
                      });
                      setMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-xs text-[#FEF3C7] bg-[#422B12]/60 hover:bg-[#422B12] flex items-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#34D399]" />
                    <span>نشان ویژه / تخفیف</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, {
                        type: "shape",
                        shapeKind: "gradient-scrim",
                      });
                      setMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded text-xs text-[#CBD5E1] hover:bg-[#252D3D] flex items-center gap-2 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 text-[#94A3B8]" />
                    <span>سایه تیره خوانایی متن (Scrim)</span>
                  </button>
                </div>
              )}

              {/* Audio options */}
              {(!menu.track || menu.track.kind === "audio") && (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => triggerFileUpload(menu.track?.id ?? null, "audio/*")}
                    className="w-full px-2.5 py-1.5 rounded bg-[#10392E]/70 hover:bg-[#10392E] text-xs font-medium text-[#D1FAE5] flex items-center gap-2 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>آپلود ویس یا موزیک (WAV / MP3)...</span>
                  </button>
                  {mediaAssets
                    .filter((a) => a.kind === "audio")
                    .map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => {
                          onQuickAddToTrack(menu.track?.id ?? null, { type: "asset", asset });
                          setMenu(null);
                        }}
                        className="w-full px-2 py-1 rounded text-[11px] text-[#D1FAE5] hover:bg-[#252D3D] flex items-center gap-2 text-right transition-colors"
                      >
                        <Music className="w-3 h-3 text-[#34D399] shrink-0" />
                        <span className="truncate">{asset.name}</span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => {
                      onQuickAddToTrack(menu.track?.id ?? null, {
                        type: "synth",
                        synthId: "reels-pulse",
                        name: "موزیک هیجانی ۱۲۶ BPM",
                        duration: 16,
                      });
                      setMenu(null);
                    }}
                    className="w-full px-2 py-1 rounded text-[11px] text-[#D1FAE5] hover:bg-[#252D3D] flex items-center gap-2 text-right transition-colors"
                  >
                    <Music className="w-3 h-3 text-[#F97316] shrink-0" />
                    <span>موزیک ریتمیک هیجانی ۱۲۶ BPM</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};
