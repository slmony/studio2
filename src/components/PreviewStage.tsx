import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Pause,
  Play,
  Repeat,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ASPECT_RATIO_DIMENSIONS } from "../data/presets";
import {
  renderFrame,
  type MediaCache,
} from "../engine/canvasRenderer";
import type { Clip, ProjectState } from "../types/studio";

interface PreviewStageProps {
  project: ProjectState;
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  showSafeZone: boolean;
  showGrid: boolean;
  selectedClipId: string | null;
  mediaCache: MediaCache;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onStepFrame: (delta: number) => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onToggleSafeZone: () => void;
  onToggleGrid: () => void;
  onSelectClip: (id: string | null) => void;
  onDragClipTransform: (clipId: string, x: number, y: number) => void;
}

function formatTimecode(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.floor((clamped % 1) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  project,
  currentTime,
  totalDuration,
  isPlaying,
  isLooping,
  isMuted,
  showSafeZone,
  showGrid,
  selectedClipId,
  mediaCache,
  canvasRef,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onToggleLoop,
  onToggleMute,
  onToggleSafeZone,
  onToggleGrid,
  onSelectClip,
  onDragClipTransform,
}) => {
  const [renderTick, setRenderTick] = useState(0);
  const dragStateRef = useRef<{
    clipId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    rectW: number;
    rectH: number;
  } | null>(null);

  const dims = ASPECT_RATIO_DIMENSIONS[project.aspectRatio];
  // Preview resolution at crisp half-HD for ultra-smooth 60fps Canvas drawing
  const previewW = Math.round(dims.width * 0.5);
  const previewH = Math.round(dims.height * 0.5);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== previewW || canvas.height !== previewH) {
      canvas.width = previewW;
      canvas.height = previewH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, project, {
      time: currentTime,
      width: previewW,
      height: previewH,
      mediaCache,
      showSafeZone,
      showGrid,
      selectedClipId,
      isExport: false,
      onMediaReady: () => setRenderTick((n) => n + 1),
    });
  }, [
    project,
    currentTime,
    previewW,
    previewH,
    showSafeZone,
    showGrid,
    selectedClipId,
    mediaCache,
    canvasRef,
    renderTick,
  ]);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    const normY = (e.clientY - rect.top) / rect.height - 0.5;

    // Pick topmost active visual clip near click (preferring text/caption/sticker/shape over background video)
    const activeClips = project.clips.filter(
      (c) => c.kind !== "audio" && currentTime >= c.start && currentTime <= c.start + c.duration
    );

    let hit: Clip | null = null;
    const prioritized = [...activeClips].sort((a, b) => {
      const rank = (k: Clip["kind"]) =>
        k === "text" || k === "caption" ? 3 : k === "sticker" ? 2 : k === "shape" ? 1 : 0;
      return rank(b.kind) - rank(a.kind);
    });

    for (const c of prioritized) {
      const dist = Math.hypot(normX - c.transform.x, normY - c.transform.y);
      if (c.kind === "text" || c.kind === "caption" || c.kind === "sticker") {
        if (dist < 0.24) {
          hit = c;
          break;
        }
      } else if (!hit) {
        hit = c;
      }
    }

    if (hit) {
      onSelectClip(hit.id);
      dragStateRef.current = {
        clipId: hit.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: hit.transform.x,
        origY: hit.transform.y,
        rectW: rect.width,
        rectH: rect.height,
      };
      canvas.setPointerCapture(e.pointerId);
    } else {
      onSelectClip(null);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startClientX) / drag.rectW;
    const dy = (e.clientY - drag.startClientY) / drag.rectH;
    let nextX = Math.max(-0.5, Math.min(0.5, drag.origX + dx));
    let nextY = Math.max(-0.5, Math.min(0.5, drag.origY + dy));
    // Gentle center snap
    if (Math.abs(nextX) < 0.018) nextX = 0;
    if (Math.abs(nextY) < 0.018) nextY = 0;
    onDragClipTransform(drag.clipId, Number(nextX.toFixed(3)), Number(nextY.toFixed(3)));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <section className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#0B0D11] relative overflow-hidden">
      {/* Subtle canvas metadata line */}
      <div className="h-9 shrink-0 px-4 flex items-center justify-between border-b border-[#1B212E] text-[11px] text-[#94A3B8]">
        <div className="flex items-center gap-2">
          <span>{dims.sub}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {dims.width}×{dims.height}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">{project.fps} FPS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSafeZone}
            title="منطقه امن ریلز و استوری اینستاگرام"
            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap ${
              showSafeZone
                ? "bg-[#F97316]/20 text-[#FB923C]"
                : "text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>منطقه امن</span>
          </button>
          <button
            type="button"
            onClick={onToggleGrid}
            title="خطوط ترازبندی یک‌سوم"
            className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap ${
              showGrid
                ? "bg-[#F97316]/20 text-[#FB923C]"
                : "text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>شبکه تراز</span>
          </button>
        </div>
      </div>

      {/* Main Centered Video Canvas Viewport */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-hidden">
        <div
          className="relative flex items-center justify-center h-full max-h-full max-w-full"
          style={{
            aspectRatio: `${dims.width} / ${dims.height}`,
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className="w-full h-full object-contain rounded-lg border border-[#252D3D] shadow-2xl cursor-grab active:cursor-grabbing bg-black"
          />
        </div>
      </div>

      {/* Transport Playback Controls */}
      <div className="h-12 shrink-0 px-5 border-t border-[#1B212E] bg-[#131720] flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-2 font-mono-tabular text-xs text-[#CBD5E1] shrink-0" dir="ltr">
          <span className="text-[#F97316] font-semibold">{formatTimecode(currentTime)}</span>
          <span className="text-[#475569]">/</span>
          <span className="text-[#94A3B8]">{formatTimecode(totalDuration)}</span>
        </div>

        <div className="flex items-center gap-1.5" dir="ltr">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="رفتن به ابتدا"
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E] transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            title="یک فریم عقب"
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            title="پخش / توقف (Space)"
            className="w-9 h-9 rounded-full bg-[#F97316] hover:bg-[#FB923C] text-[#0B0D11] flex items-center justify-center transition-colors mx-1"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => onStepFrame(1)}
            title="یک فریم جلو"
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(totalDuration)}
            title="رفتن به انتها"
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E] transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleLoop}
            title="پخش حلقه‌ای"
            className={`p-1.5 rounded-md transition-colors ${
              isLooping ? "bg-[#F97316]/20 text-[#FB923C]" : "text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? "وصل صدا" : "قطع صدا"}
            className={`p-1.5 rounded-md transition-colors ${
              isMuted ? "bg-red-500/20 text-red-400" : "text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </section>
  );
};
