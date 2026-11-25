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
  Lock,
  Magnet,
  Music,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getSynthWaveform } from "../engine/audioSynth";
import type { Clip, ProjectState, Track } from "../types/studio";

interface TimelinePanelProps {
  project: ProjectState;
  currentTime: number;
  totalDuration: number;
  selectedClipId: string | null;
  snapEnabled: boolean;
  onSeek: (time: number) => void;
  onSelectClip: (id: string | null) => void;
  onUpdateClipTiming: (clipId: string, start: number, duration: number, trimStart?: number) => void;
  onSplitAtPlayhead: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onToggleSnap: () => void;
  onAddMarker: () => void;
  onRemoveMarker: (id: string) => void;
  onToggleTrackFlag: (trackId: string, flag: "visible" | "locked" | "muted" | "solo") => void;
  onMoveTrackOrder: (trackId: string, dir: -1 | 1) => void;
}

const TRACK_COLORS: Record<Track["kind"], { bg: string; border: string; text: string }> = {
  video: { bg: "bg-[#1D3557]/85", border: "border-[#3B82F6]/60", text: "text-[#DBEAFE]" },
  graphic: { bg: "bg-[#422B12]/85", border: "border-[#F59E0B]/60", text: "text-[#FEF3C7]" },
  text: { bg: "bg-[#31214F]/85", border: "border-[#A855F7]/60", text: "text-[#F3E8FF]" },
  audio: { bg: "bg-[#10392E]/85", border: "border-[#10B981]/60", text: "text-[#D1FAE5]" },
};

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  project,
  currentTime,
  totalDuration,
  selectedClipId,
  snapEnabled,
  onSeek,
  onSelectClip,
  onUpdateClipTiming,
  onSplitAtPlayhead,
  onDuplicateSelected,
  onDeleteSelected,
  onToggleSnap,
  onAddMarker,
  onRemoveMarker,
  onToggleTrackFlag,
  onMoveTrackOrder,
}) => {
  const [pxPerSec, setPxPerSec] = useState(64);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timelineLength = Math.max(totalDuration + 4, 16);
  const timelineWidthPx = Math.max(760, Math.round(timelineLength * pxPerSec));

  const dragOpRef = useRef<{
    mode: "move" | "trim-start" | "trim-end";
    clip: Clip;
    startClientX: number;
  } | null>(null);

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
    if (kind === "video") return <Film className="w-3.5 h-3.5 text-[#60A5FA]" />;
    if (kind === "text") return <Type className="w-3.5 h-3.5 text-[#C084FC]" />;
    if (kind === "graphic") return <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" />;
    return <Music className="w-3.5 h-3.5 text-[#34D399]" />;
  };

  // Display order: top-most visual layers first, audio at bottom
  const displayTracks = [...project.tracks].reverse();

  return (
    <section className="h-[248px] shrink-0 bg-[#131720] border-t border-[#252D3D] flex flex-col select-none">
      {/* Timeline Action Toolbar */}
      <div className="h-10 shrink-0 px-4 border-b border-[#252D3D] flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSplitAtPlayhead}
            disabled={!selectedClipId}
            title="برش کلیپ در محل هد پخش (S)"
            className="px-2.5 py-1 rounded-md text-xs font-medium text-[#E2E8F0] bg-[#1B212E] hover:bg-[#252D3D] disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5 text-[#F97316]" />
            <span>برش</span>
          </button>
          <button
            type="button"
            onClick={onDuplicateSelected}
            disabled={!selectedClipId}
            title="تکثیر کلیپ انتخاب‌شده"
            className="px-2.5 py-1 rounded-md text-xs font-medium text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>تکثیر</span>
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!selectedClipId}
            title="حذف کلیپ (Delete)"
            className="px-2.5 py-1 rounded-md text-xs font-medium text-[#CBD5E1] hover:bg-red-500/15 hover:text-red-400 disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف</span>
          </button>

          <span className="h-4 w-px bg-[#252D3D] mx-1" aria-hidden="true" />

          <button
            type="button"
            onClick={onAddMarker}
            title="افزودن نشانگر ریتم در زمان فعلی (M)"
            className="px-2.5 py-1 rounded-md text-xs font-medium text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Bookmark className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>نشانگر</span>
          </button>

          <button
            type="button"
            onClick={onToggleSnap}
            title="چسبندگی مغناطیسی کلیپ‌ها"
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              snapEnabled
                ? "bg-[#F97316]/20 text-[#FB923C]"
                : "text-[#94A3B8] hover:bg-[#1B212E] hover:text-white"
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>چسبندگی</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.max(24, z - 16))}
            title="کوچک‌نمایی تایم‌لاین"
            className="p-1 rounded hover:bg-[#1B212E] hover:text-white"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={24}
            max={160}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-24 studio-slider"
            aria-label="بزرگ‌نمایی تایم‌لاین"
          />
          <button
            type="button"
            onClick={() => setPxPerSec((z) => Math.min(160, z + 16))}
            title="بزرگ‌نمایی تایم‌لاین"
            className="p-1 rounded hover:bg-[#1B212E] hover:text-white"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono-tabular text-[11px] w-10 text-left">
            {Math.round((pxPerSec / 64) * 100)}%
          </span>
        </div>
      </div>

      {/* Main Split: Track Headers (Right in RTL) + Scrollable LTR Time Grid */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Track Control Column */}
        <div className="w-48 shrink-0 border-l border-[#252D3D] bg-[#10141C] flex flex-col">
          <div className="h-7 shrink-0 border-b border-[#252D3D] px-3 flex items-center text-[11px] text-[#64748B]">
            لایه‌ها ({project.tracks.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E2534]">
            {displayTracks.map((track) => (
              <div
                key={track.id}
                className="h-11 px-2.5 flex items-center justify-between gap-1 hover:bg-[#161B26] transition-colors"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {trackIcon(track.kind)}
                  <span className="text-[11px] font-medium text-[#CBD5E1] truncate">{track.name}</span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
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
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable LTR Time Ruler + Tracks Grid */}
        <div
          ref={scrollRef}
          dir="ltr"
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
            <div className="divide-y divide-[#1A202D]">
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
                          className={`absolute top-1.5 bottom-1.5 rounded-md border overflow-hidden flex items-center cursor-grab active:cursor-grabbing transition-shadow ${
                            style.bg
                          } ${
                            isSelected
                              ? "border-[#F97316] ring-1 ring-[#F97316] z-10"
                              : `${style.border} hover:brightness-110`
                          }`}
                        >
                          {/* Left Trim Handle */}
                          <div
                            onPointerDown={(e) => startClipDrag(e, clip, "trim-start", track.locked)}
                            className="w-2 h-full cursor-col-resize hover:bg-[#F97316]/60 shrink-0 z-10"
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
                            className="w-2 h-full cursor-col-resize hover:bg-[#F97316]/60 shrink-0 z-10"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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
    </section>
  );
};
