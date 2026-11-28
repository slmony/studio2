import React, { useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  FlipHorizontal,
  FlipVertical,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  ANIMATION_OPTIONS,
  BLEND_MODE_OPTIONS,
  DEFAULT_COLOR_GRADE,
  FILTER_PRESETS,
  FONT_OPTIONS,
  KEN_BURNS_OPTIONS,
  LOOP_ANIMATION_OPTIONS,
  TRANSITION_OPTIONS,
} from "../data/presets";
import type {
  AudioEqPreset,
  Clip,
  ColorGrade,
  ProjectState,
  TextStyleConfig,
} from "../types/studio";

interface InspectorPanelProps {
  project: ProjectState;
  selectedClip: Clip | null;
  onUpdateClip: (clipId: string, updater: (c: Clip) => Clip) => void;
  onUpdateProject: (updater: (p: ProjectState) => ProjectState) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[#CBD5E1]">{label}</span>
      <span className="font-mono-tabular text-[#94A3B8]">
        {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
        {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full studio-slider"
    />
  </div>
);

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selectedClip,
  onUpdateClip,
  onUpdateProject,
}) => {
  const [subTab, setSubTab] = useState<"basic" | "motion" | "color" | "special">("basic");
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  if (!selectedClip) {
    // Global Project & Instagram Overlays Inspector
    const bg = project.background;
    const pb = project.progressBar;
    const vz = project.visualizer;
    const wm = project.watermark;

    return (
      <aside className="w-[312px] shrink-0 bg-[#131720] border-r border-[#252D3D] overflow-y-auto p-4 space-y-5 select-none">
        <div>
          <h3 className="text-xs font-bold text-white">تنظیمات بوم و پوشش‌های ریلز</h3>
          <p className="text-[11px] text-[#94A3B8] mt-1">
            برای ویرایش جزئیات هر لایه، روی کلیپ آن در تایم‌لاین یا بوم کلیک کنید.
          </p>
        </div>

        {/* Canvas Background */}
        <div className="space-y-3 pt-3 border-t border-[#252D3D]">
          <div className="text-xs font-semibold text-white">پس‌زمینه بوم</div>
          <div className="grid grid-cols-4 gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
            {[
              { id: "solid" as const, label: "تک‌رنگ" },
              { id: "linear" as const, label: "گرادیان" },
              { id: "radial" as const, label: "شعاعی" },
              { id: "ambient" as const, label: "متحرک" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  onUpdateProject((p) => ({
                    ...p,
                    background: { ...p.background, mode: m.id },
                  }))
                }
                className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                  bg.mode === m.id ? "bg-[#1B212E] text-[#00AE4D]" : "text-[#94A3B8] hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-[10px] text-[#94A3B8]">
              <span>رنگ ۱</span>
              <input
                type="color"
                value={bg.color1}
                onChange={(e) =>
                  onUpdateProject((p) => ({
                    ...p,
                    background: { ...p.background, color1: e.target.value },
                  }))
                }
                className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
              />
            </label>
            {bg.mode !== "solid" && (
              <>
                <label className="space-y-1 text-[10px] text-[#94A3B8]">
                  <span>رنگ ۲</span>
                  <input
                    type="color"
                    value={bg.color2}
                    onChange={(e) =>
                      onUpdateProject((p) => ({
                        ...p,
                        background: { ...p.background, color2: e.target.value },
                      }))
                    }
                    className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                  />
                </label>
                <label className="space-y-1 text-[10px] text-[#94A3B8]">
                  <span>رنگ ۳</span>
                  <input
                    type="color"
                    value={bg.color3}
                    onChange={(e) =>
                      onUpdateProject((p) => ({
                        ...p,
                        background: { ...p.background, color3: e.target.value },
                      }))
                    }
                    className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                  />
                </label>
              </>
            )}
          </div>

          {bg.mode === "linear" && (
            <SliderRow
              label="زاویه گرادیان"
              value={bg.angle}
              min={0}
              max={360}
              unit="°"
              onChange={(v) =>
                onUpdateProject((p) => ({ ...p, background: { ...p.background, angle: v } }))
              }
            />
          )}
        </div>

        {/* Animated Progress Bar */}
        <div className="space-y-3 pt-3 border-t border-[#252D3D]">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-semibold text-white">نوار پیشرفت متحرک ریلز</span>
            <input
              type="checkbox"
              checked={pb.enabled}
              onChange={(e) =>
                onUpdateProject((p) => ({
                  ...p,
                  progressBar: { ...p.progressBar, enabled: e.target.checked },
                }))
              }
              className="accent-[#00AE4D] w-4 h-4"
            />
          </label>
          {pb.enabled && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                {(["top", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() =>
                      onUpdateProject((p) => ({
                        ...p,
                        progressBar: { ...p.progressBar, position: pos },
                      }))
                    }
                    className={`py-1.5 rounded text-[11px] border ${
                      pb.position === pos
                        ? "border-[#00AE4D] text-white bg-[#1B212E]"
                        : "border-[#252D3D] text-[#94A3B8] bg-[#0B0D11]"
                    }`}
                  >
                    {pos === "top" ? "بالای کادر" : "پایین کادر"}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
                <span>رنگ نوار</span>
                <input
                  type="color"
                  value={pb.color}
                  onChange={(e) =>
                    onUpdateProject((p) => ({
                      ...p,
                      progressBar: { ...p.progressBar, color: e.target.value },
                    }))
                  }
                  className="w-12 h-7 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                />
              </div>
              <SliderRow
                label="ضخامت نوار"
                value={pb.height}
                min={3}
                max={20}
                unit="px"
                onChange={(v) =>
                  onUpdateProject((p) => ({ ...p, progressBar: { ...p.progressBar, height: v } }))
                }
              />
            </div>
          )}
        </div>

        {/* Audio Spectrum Visualizer */}
        <div className="space-y-3 pt-3 border-t border-[#252D3D]">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-semibold text-white">ویزوالایزر موج صدا</span>
            <input
              type="checkbox"
              checked={vz.enabled}
              onChange={(e) =>
                onUpdateProject((p) => ({
                  ...p,
                  visualizer: { ...p.visualizer, enabled: e.target.checked },
                }))
              }
              className="accent-[#00AE4D] w-4 h-4"
            />
          </label>
          {vz.enabled && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-3 gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                {[
                  { id: "bars" as const, label: "ستونی" },
                  { id: "mirror" as const, label: "آینه‌ای" },
                  { id: "wave" as const, label: "موجی" },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() =>
                      onUpdateProject((p) => ({ ...p, visualizer: { ...p.visualizer, style: st.id } }))
                    }
                    className={`py-1 rounded text-[11px] ${
                      vz.style === st.id ? "bg-[#1B212E] text-[#00AE4D]" : "text-[#94A3B8]"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
                <span>رنگ موج</span>
                <input
                  type="color"
                  value={vz.color}
                  onChange={(e) =>
                    onUpdateProject((p) => ({ ...p, visualizer: { ...p.visualizer, color: e.target.value } }))
                  }
                  className="w-12 h-7 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                />
              </div>
              <SliderRow
                label="ارتفاع عمودی روی کادر"
                value={Math.round(vz.positionY * 100)}
                min={15}
                max={92}
                unit="%"
                onChange={(v) =>
                  onUpdateProject((p) => ({ ...p, visualizer: { ...p.visualizer, positionY: v / 100 } }))
                }
              />
              <SliderRow
                label="شدت نوسان"
                value={vz.intensity}
                min={0.3}
                max={2}
                step={0.05}
                onChange={(v) =>
                  onUpdateProject((p) => ({ ...p, visualizer: { ...p.visualizer, intensity: v } }))
                }
              />
            </div>
          )}
        </div>

        {/* Brand Watermark & Logo */}
        <div className="space-y-3 pt-3 border-t border-[#252D3D]">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-semibold text-white">واترمارک و لوگوی پیج</span>
            <input
              type="checkbox"
              checked={wm.enabled}
              onChange={(e) =>
                onUpdateProject((p) => ({
                  ...p,
                  watermark: { ...p.watermark, enabled: e.target.checked },
                }))
              }
              className="accent-[#00AE4D] w-4 h-4"
            />
          </label>
          {wm.enabled && (
            <div className="space-y-2.5">
              <input
                value={wm.handle}
                dir="ltr"
                onChange={(e) =>
                  onUpdateProject((p) => ({ ...p, watermark: { ...p.watermark, handle: e.target.value } }))
                }
                placeholder="@your.page"
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] px-2.5 py-1.5 text-xs text-white outline-none"
              />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    onUpdateProject((p) => ({ ...p, watermark: { ...p.watermark, logoSrc: url } }));
                  }
                }}
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex-1 py-1.5 px-2.5 rounded-lg border border-[#252D3D] hover:border-[#00AE4D] bg-[#0B0D11] text-[11px] text-[#CBD5E1] flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-[#00AE4D]" />
                  <span>{wm.logoSrc ? "تغییر لوگوی PNG" : "آپلود لوگوی برند (PNG)"}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProject((p) => ({
                      ...p,
                      watermark: {
                        ...p.watermark,
                        logoSrc: "/assets/aistudio/logo_34203fd0.png",
                        corner: "bottom-center",
                      },
                    }))
                  }
                  title="بازگردانی لوگوی رسمی شرکت عرفان صنعت اصفهان"
                  className="px-2.5 py-1.5 rounded-lg border border-[#252D3D] hover:border-[#00AE4D] bg-[#0B0D11] text-[10px] font-semibold text-[#A5A5A4] hover:text-white whitespace-nowrap"
                >
                  لوگوی ESE
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "top-right" as const, label: "بالا راست" },
                  { id: "top-left" as const, label: "بالا چپ" },
                  { id: "bottom-right" as const, label: "پایین راست" },
                  { id: "bottom-left" as const, label: "پایین چپ" },
                  { id: "bottom-center" as const, label: "پایین وسط (ثابت زیر ویدیو)" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      onUpdateProject((p) => ({ ...p, watermark: { ...p.watermark, corner: c.id } }))
                    }
                    className={`py-1 rounded text-[11px] border ${
                      c.id === "bottom-center" ? "col-span-2" : ""
                    } ${
                      wm.corner === c.id
                        ? "border-[#00AE4D] text-white bg-[#1B212E]"
                        : "border-[#252D3D] text-[#94A3B8] bg-[#0B0D11]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <SliderRow
                label="شفافیت واترمارک"
                value={Math.round(wm.opacity * 100)}
                min={15}
                max={100}
                unit="%"
                onChange={(v) =>
                  onUpdateProject((p) => ({ ...p, watermark: { ...p.watermark, opacity: v / 100 } }))
                }
              />
            </div>
          )}
        </div>
      </aside>
    );
  }

  // Selected Clip Inspector
  const clip = selectedClip;
  const isText = clip.kind === "text" || clip.kind === "caption";
  const isAudio = clip.kind === "audio";
  const isMedia = clip.kind === "image" || clip.kind === "video";
  const isSticker = clip.kind === "sticker";
  const isShape = clip.kind === "shape";

  const updateText = (patch: Partial<TextStyleConfig>) => {
    onUpdateClip(clip.id, (c) => ({
      ...c,
      textStyle: c.textStyle ? { ...c.textStyle, ...patch } : undefined,
    }));
  };

  const updateColor = (patch: Partial<ColorGrade>) => {
    onUpdateClip(clip.id, (c) => ({ ...c, color: { ...c.color, ...patch } }));
  };

  const tabs = isAudio
    ? [{ id: "special" as const, label: "تنظیمات صدا" }, { id: "basic" as const, label: "زمان‌بندی" }]
    : isText
    ? [
        { id: "special" as const, label: "متن" },
        { id: "motion" as const, label: "انیمیشن" },
        { id: "basic" as const, label: "کادر" },
      ]
    : [
        { id: "basic" as const, label: "کادر" },
        { id: "motion" as const, label: "حرکت" },
        { id: "color" as const, label: "رنگ و افکت" },
        ...(isSticker || isShape || clip.kind === "video"
          ? [{ id: "special" as const, label: clip.kind === "video" ? "صدا" : "استایل" }]
          : []),
      ];

  const activeSub = tabs.some((t) => t.id === subTab) ? subTab : tabs[0].id;

  return (
    <aside className="w-[312px] shrink-0 bg-[#131720] border-r border-[#252D3D] flex flex-col min-h-0 select-none">
      {/* Selected Clip Title Header */}
      <div className="p-3.5 border-b border-[#252D3D] space-y-2.5 shrink-0">
        <input
          value={clip.name}
          onChange={(e) => onUpdateClip(clip.id, (c) => ({ ...c, name: e.target.value }))}
          className="w-full bg-[#0B0D11] border border-[#252D3D] focus:border-[#00AE4D] rounded-md px-2.5 py-1.5 text-xs font-bold text-white outline-none"
        />
        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`flex-1 py-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                activeSub === t.id ? "bg-[#1B212E] text-[#00AE4D]" : "text-[#94A3B8] hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inspector Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* BASIC / TRANSFORM TAB */}
        {activeSub === "basic" && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-[#94A3B8]">شروع (ثانیه)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  value={clip.start}
                  onChange={(e) =>
                    onUpdateClip(clip.id, (c) => ({ ...c, start: Math.max(0, Number(e.target.value)) }))
                  }
                  className="w-full bg-[#0B0D11] border border-[#252D3D] rounded px-2 py-1.5 text-xs font-mono-tabular text-white outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[#94A3B8]">مدت (ثانیه)</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.3}
                  value={clip.duration}
                  onChange={(e) =>
                    onUpdateClip(clip.id, (c) => ({ ...c, duration: Math.max(0.3, Number(e.target.value)) }))
                  }
                  className="w-full bg-[#0B0D11] border border-[#252D3D] rounded px-2 py-1.5 text-xs font-mono-tabular text-white outline-none"
                />
              </div>
            </div>

            {(clip.kind === "video" || clip.kind === "audio") && (
              <SliderRow
                label="سرعت پخش (Speed)"
                value={clip.speed}
                min={0.25}
                max={4}
                step={0.05}
                unit="x"
                onChange={(v) => onUpdateClip(clip.id, (c) => ({ ...c, speed: v }))}
              />
            )}

            {!isAudio && (
              <>
                <SliderRow
                  label="موقعیت افقی X"
                  value={Math.round(clip.transform.x * 100)}
                  min={-50}
                  max={50}
                  unit="%"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, x: v / 100 },
                    }))
                  }
                />
                <SliderRow
                  label="موقعیت عمودی Y"
                  value={Math.round(clip.transform.y * 100)}
                  min={-50}
                  max={50}
                  unit="%"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, y: v / 100 },
                    }))
                  }
                />
                <SliderRow
                  label="مقیاس (Scale)"
                  value={Math.round(clip.transform.scale * 100)}
                  min={20}
                  max={250}
                  unit="%"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, scale: v / 100 },
                    }))
                  }
                />
                <SliderRow
                  label="چرخش (Rotation)"
                  value={clip.transform.rotation}
                  min={-180}
                  max={180}
                  unit="°"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, rotation: v },
                    }))
                  }
                />
                <SliderRow
                  label="شفافیت (Opacity)"
                  value={Math.round(clip.transform.opacity * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, opacity: v / 100 },
                    }))
                  }
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(clip.id, (c) => ({
                        ...c,
                        transform: { ...c.transform, flipX: !c.transform.flipX },
                      }))
                    }
                    className={`py-1.5 rounded-lg border text-xs flex items-center justify-center gap-1.5 ${
                      clip.transform.flipX
                        ? "border-[#00AE4D] bg-[#1B212E] text-white"
                        : "border-[#252D3D] bg-[#0B0D11] text-[#94A3B8]"
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>قرینه افقی</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(clip.id, (c) => ({
                        ...c,
                        transform: { ...c.transform, flipY: !c.transform.flipY },
                      }))
                    }
                    className={`py-1.5 rounded-lg border text-xs flex items-center justify-center gap-1.5 ${
                      clip.transform.flipY
                        ? "border-[#00AE4D] bg-[#1B212E] text-white"
                        : "border-[#252D3D] bg-[#0B0D11] text-[#94A3B8]"
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    <span>قرینه عمودی</span>
                  </button>
                </div>

                {isMedia && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-[#94A3B8] block">حالت پرکردن کادر</label>
                      <div className="grid grid-cols-3 gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                        {[
                          { id: "cover" as const, label: "پرکردن" },
                          { id: "contain" as const, label: "کامل" },
                          { id: "blur-fill" as const, label: "پس‌زمینه تار" },
                        ].map((fm) => (
                          <button
                            key={fm.id}
                            type="button"
                            onClick={() =>
                              onUpdateClip(clip.id, (c) => ({
                                ...c,
                                transform: { ...c.transform, fitMode: fm.id },
                              }))
                            }
                            className={`py-1 rounded text-[10px] font-medium ${
                              clip.transform.fitMode === fm.id
                                ? "bg-[#1B212E] text-[#00AE4D]"
                                : "text-[#94A3B8]"
                            }`}
                          >
                            {fm.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <SliderRow
                      label="گردی گوشه‌ها"
                      value={clip.transform.borderRadius}
                      min={0}
                      max={160}
                      unit="px"
                      onChange={(v) =>
                        onUpdateClip(clip.id, (c) => ({
                          ...c,
                          transform: { ...c.transform, borderRadius: v },
                        }))
                      }
                    />
                    <SliderRow
                      label="ضخامت کادر دور"
                      value={clip.transform.borderWidth}
                      min={0}
                      max={24}
                      unit="px"
                      onChange={(v) =>
                        onUpdateClip(clip.id, (c) => ({
                          ...c,
                          transform: { ...c.transform, borderWidth: v },
                        }))
                      }
                    />
                  </>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] text-[#94A3B8] block">حالت ترکیب لایه (Blend Mode)</label>
                  <select
                    value={clip.transform.blendMode}
                    onChange={(e) =>
                      onUpdateClip(clip.id, (c) => ({
                        ...c,
                        transform: {
                          ...c.transform,
                          blendMode: e.target.value as Clip["transform"]["blendMode"],
                        },
                      }))
                    }
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
                  >
                    {BLEND_MODE_OPTIONS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}

        {/* MOTION & ANIMATION TAB */}
        {activeSub === "motion" && !isAudio && (
          <div className="space-y-3.5">
            {isMedia && (
              <div className="space-y-1">
                <label className="text-[11px] text-[#94A3B8] block">حرکت سینمایی کن‌برنز (Ken Burns)</label>
                <select
                  value={clip.kenBurns}
                  onChange={(e) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      kenBurns: e.target.value as Clip["kenBurns"],
                    }))
                  }
                  className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
                >
                  {KEN_BURNS_OPTIONS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] text-[#94A3B8] block">انیمیشن ورود</label>
              <select
                value={clip.enterAnimation}
                onChange={(e) =>
                  onUpdateClip(clip.id, (c) => ({
                    ...c,
                    enterAnimation: e.target.value as Clip["enterAnimation"],
                  }))
                }
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
              >
                {ANIMATION_OPTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-[#94A3B8] block">انیمیشن خروج</label>
              <select
                value={clip.exitAnimation}
                onChange={(e) =>
                  onUpdateClip(clip.id, (c) => ({
                    ...c,
                    exitAnimation: e.target.value as Clip["exitAnimation"],
                  }))
                }
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
              >
                {ANIMATION_OPTIONS.filter((a) => a.id !== "typewriter").map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <SliderRow
              label="مدت زمان انیمیشن"
              value={clip.animationDuration}
              min={0.15}
              max={2.5}
              step={0.05}
              unit="s"
              onChange={(v) => onUpdateClip(clip.id, (c) => ({ ...c, animationDuration: v }))}
            />

            <div className="space-y-1">
              <label className="text-[11px] text-[#94A3B8] block">حرکت حلقه‌ای مداوم (Loop)</label>
              <select
                value={clip.loopAnimation}
                onChange={(e) =>
                  onUpdateClip(clip.id, (c) => ({
                    ...c,
                    loopAnimation: e.target.value as Clip["loopAnimation"],
                  }))
                }
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
              >
                {LOOP_ANIMATION_OPTIONS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-[#252D3D] space-y-2.5">
              <div className="space-y-1">
                <label className="text-[11px] text-[#94A3B8] block">ترنزیشن ورود صحنه</label>
                <select
                  value={clip.transitionIn}
                  onChange={(e) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transitionIn: e.target.value as Clip["transitionIn"],
                    }))
                  }
                  className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
                >
                  {TRANSITION_OPTIONS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.label}
                    </option>
                  ))}
                </select>
              </div>
              <SliderRow
                label="مدت ترنزیشن"
                value={clip.transitionDuration}
                min={0.15}
                max={1.5}
                step={0.05}
                unit="s"
                onChange={(v) => onUpdateClip(clip.id, (c) => ({ ...c, transitionDuration: v }))}
              />
            </div>
          </div>
        )}

        {/* COLOR GRADING & VFX TAB */}
        {activeSub === "color" && !isAudio && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">تنظیم رنگ و افکت‌های سینمایی</span>
              <button
                type="button"
                onClick={() => updateColor({ ...DEFAULT_COLOR_GRADE })}
                className="text-[11px] text-[#94A3B8] hover:text-white flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>بازنشانی</span>
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-[#94A3B8] block">فیلتر آماده (LUT)</label>
              <select
                value={clip.color.preset}
                onChange={(e) => {
                  const found = FILTER_PRESETS.find((f) => f.id === e.target.value);
                  if (found) updateColor({ ...DEFAULT_COLOR_GRADE, ...found.grade, preset: found.id });
                }}
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
              >
                {FILTER_PRESETS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <SliderRow label="روشنایی" value={clip.color.brightness} min={30} max={180} unit="%" onChange={(v) => updateColor({ brightness: v })} />
            <SliderRow label="کنتراست" value={clip.color.contrast} min={40} max={200} unit="%" onChange={(v) => updateColor({ contrast: v })} />
            <SliderRow label="اشباع رنگ" value={clip.color.saturation} min={0} max={200} unit="%" onChange={(v) => updateColor({ saturation: v })} />
            <SliderRow label="دمای رنگ (سرد/گرم)" value={clip.color.warmth} min={-100} max={100} onChange={(v) => updateColor({ warmth: v })} />
            <SliderRow label="چرخش طیف (Hue)" value={clip.color.hueRotate} min={-180} max={180} unit="°" onChange={(v) => updateColor({ hueRotate: v })} />
            <SliderRow label="تاری (Blur)" value={clip.color.blur} min={0} max={25} unit="px" onChange={(v) => updateColor({ blur: v })} />

            <div className="pt-2 border-t border-[#252D3D] space-y-3">
              <div className="text-[11px] font-semibold text-[#94A3B8]">جلوه‌های ویژه (VFX)</div>
              <SliderRow label="وینیت سینمایی" value={clip.color.vignette} min={0} max={100} unit="%" onChange={(v) => updateColor({ vignette: v })} />
              <SliderRow label="دانه فیلم آنالوگ (Grain)" value={clip.color.grain} min={0} max={100} unit="%" onChange={(v) => updateColor({ grain: v })} />
              <SliderRow label="خطوط رترو (Scanlines)" value={clip.color.scanlines} min={0} max={100} unit="%" onChange={(v) => updateColor({ scanlines: v })} />
              <SliderRow label="گلیچ دیجیتال RGB" value={clip.color.glitch} min={0} max={100} unit="%" onChange={(v) => updateColor({ glitch: v })} />
              <SliderRow label="لرزش دوربین (Shake)" value={clip.color.cameraShake} min={0} max={100} unit="%" onChange={(v) => updateColor({ cameraShake: v })} />
            </div>
          </div>
        )}

        {/* SPECIAL TAB: TEXT / STICKER / SHAPE / AUDIO */}
        {activeSub === "special" && (
          <div className="space-y-3.5">
            {isText && clip.textStyle && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#94A3B8] block">متن نمایشی</label>
                  <textarea
                    rows={3}
                    value={clip.textStyle.text}
                    onChange={(e) => updateText({ text: e.target.value })}
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#00AE4D] p-2.5 text-xs text-white outline-none resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-[#94A3B8] block">فونت فارسی / نمایشی</label>
                  <select
                    value={clip.textStyle.fontFamily}
                    onChange={(e) => updateText({ fontFamily: e.target.value })}
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-xs text-white outline-none"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <SliderRow
                  label="اندازه فونت"
                  value={clip.textStyle.fontSize}
                  min={24}
                  max={150}
                  unit="px"
                  onChange={(v) => updateText({ fontSize: v })}
                />
                <SliderRow
                  label="فاصله خطوط"
                  value={clip.textStyle.lineHeight}
                  min={1}
                  max={2.2}
                  step={0.05}
                  onChange={(v) => updateText({ lineHeight: v })}
                />

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#CBD5E1]">ترازبندی</span>
                  <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                    {[
                      { id: "right" as const, icon: AlignRight },
                      { id: "center" as const, icon: AlignCenter },
                      { id: "left" as const, icon: AlignLeft },
                    ].map((al) => {
                      const Icon = al.icon;
                      return (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => updateText({ align: al.id })}
                          className={`p-1.5 rounded ${
                            clip.textStyle?.align === al.id
                              ? "bg-[#1B212E] text-[#00AE4D]"
                              : "text-[#94A3B8]"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 text-[10px] text-[#94A3B8]">
                    <span>رنگ متن</span>
                    <input
                      type="color"
                      value={clip.textStyle.color}
                      onChange={(e) => updateText({ color: e.target.value })}
                      className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] text-[#94A3B8]">
                    <span>رنگ حاشیه</span>
                    <input
                      type="color"
                      value={clip.textStyle.strokeColor}
                      onChange={(e) => updateText({ strokeColor: e.target.value })}
                      className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] text-[#94A3B8]">
                    <span>کادر پشت</span>
                    <input
                      type="color"
                      value={clip.textStyle.bgColor}
                      onChange={(e) => updateText({ bgColor: e.target.value })}
                      className="w-full h-8 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                    />
                  </label>
                </div>

                {clip.kind === "caption" && (
                  <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
                    <span>رنگ هایلایت کلمه فعال کارائوکه</span>
                    <input
                      type="color"
                      value={clip.textStyle.highlightColor}
                      onChange={(e) => updateText({ highlightColor: e.target.value })}
                      className="w-12 h-7 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                    />
                  </div>
                )}

                <label className="flex items-center justify-between text-xs text-[#CBD5E1] cursor-pointer">
                  <span>متن گرادیانی دو رنگ</span>
                  <input
                    type="checkbox"
                    checked={clip.textStyle.useGradient}
                    onChange={(e) => updateText({ useGradient: e.target.checked })}
                    className="accent-[#00AE4D] w-4 h-4"
                  />
                </label>

                <SliderRow
                  label="ضخامت حاشیه دور متن"
                  value={clip.textStyle.strokeWidth}
                  min={0}
                  max={14}
                  unit="px"
                  onChange={(v) => updateText({ strokeWidth: v })}
                />
                <SliderRow
                  label="شفافیت کادر پس‌زمینه"
                  value={Math.round(clip.textStyle.bgOpacity * 100)}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => updateText({ bgOpacity: v / 100 })}
                />
                <SliderRow
                  label="سایه متن"
                  value={clip.textStyle.shadowBlur}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(v) => updateText({ shadowBlur: v })}
                />
              </>
            )}

            {isSticker && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#94A3B8] block">متن روی استیکر</label>
                  <input
                    value={clip.stickerLabel || ""}
                    onChange={(e) => onUpdateClip(clip.id, (c) => ({ ...c, stickerLabel: e.target.value }))}
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] px-2.5 py-2 text-xs text-white outline-none"
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
                  <span>رنگ اصلی استیکر</span>
                  <input
                    type="color"
                    value={clip.stickerAccent || "#00AE4D"}
                    onChange={(e) => onUpdateClip(clip.id, (c) => ({ ...c, stickerAccent: e.target.value }))}
                    className="w-12 h-7 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                  />
                </div>
              </>
            )}

            {isShape && (
              <>
                <div className="flex items-center justify-between text-[11px] text-[#CBD5E1]">
                  <span>رنگ اول شکل</span>
                  <input
                    type="color"
                    value={clip.shapeFill?.startsWith("#") ? clip.shapeFill : "#00AE4D"}
                    onChange={(e) => onUpdateClip(clip.id, (c) => ({ ...c, shapeFill: e.target.value }))}
                    className="w-12 h-7 rounded bg-[#0B0D11] border border-[#252D3D] cursor-pointer"
                  />
                </div>
                <SliderRow
                  label="گردی گوشه"
                  value={clip.transform.borderRadius}
                  min={0}
                  max={120}
                  unit="px"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      transform: { ...c.transform, borderRadius: v },
                    }))
                  }
                />
              </>
            )}

            {(isAudio || clip.kind === "video") && (
              <>
                <label className="flex items-center justify-between text-xs text-[#CBD5E1] cursor-pointer">
                  <span>بی‌صدا کردن این کلیپ</span>
                  <input
                    type="checkbox"
                    checked={Boolean(clip.audio?.muted)}
                    onChange={(e) =>
                      onUpdateClip(clip.id, (c) => ({
                        ...c,
                        audio: {
                          volume: 1,
                          fadeIn: 0,
                          fadeOut: 0,
                          eqPreset: "normal",
                          ...(c.audio ?? {}),
                          muted: e.target.checked,
                        },
                      }))
                    }
                    className="accent-[#00AE4D] w-4 h-4"
                  />
                </label>

                <SliderRow
                  label="حجم صدا (Volume)"
                  value={Math.round((clip.audio?.volume ?? 1) * 100)}
                  min={0}
                  max={200}
                  unit="%"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      audio: {
                        fadeIn: 0,
                        fadeOut: 0,
                        muted: false,
                        eqPreset: "normal",
                        ...(c.audio ?? {}),
                        volume: v / 100,
                      },
                    }))
                  }
                />
                <SliderRow
                  label="محو شدن تدریجی ورود (Fade In)"
                  value={clip.audio?.fadeIn ?? 0}
                  min={0}
                  max={4}
                  step={0.1}
                  unit="s"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      audio: {
                        volume: 1,
                        fadeOut: 0,
                        muted: false,
                        eqPreset: "normal",
                        ...(c.audio ?? {}),
                        fadeIn: v,
                      },
                    }))
                  }
                />
                <SliderRow
                  label="محو شدن تدریجی خروج (Fade Out)"
                  value={clip.audio?.fadeOut ?? 0}
                  min={0}
                  max={4}
                  step={0.1}
                  unit="s"
                  onChange={(v) =>
                    onUpdateClip(clip.id, (c) => ({
                      ...c,
                      audio: {
                        volume: 1,
                        fadeIn: 0,
                        muted: false,
                        eqPreset: "normal",
                        ...(c.audio ?? {}),
                        fadeOut: v,
                      },
                    }))
                  }
                />
                <div className="space-y-1">
                  <label className="text-[11px] text-[#94A3B8] block">اکولایزر سریع (EQ)</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "normal" as AudioEqPreset, label: "طبیعی" },
                      { id: "voice" as AudioEqPreset, label: "شفافیت گوینده" },
                      { id: "bass" as AudioEqPreset, label: "تقویت بیس" },
                      { id: "radio" as AudioEqPreset, label: "رادیویی رترو" },
                    ].map((eq) => (
                      <button
                        key={eq.id}
                        type="button"
                        onClick={() =>
                          onUpdateClip(clip.id, (c) => ({
                            ...c,
                            audio: {
                              volume: 1,
                              fadeIn: 0,
                              fadeOut: 0,
                              muted: false,
                              ...(c.audio ?? {}),
                              eqPreset: eq.id,
                            },
                          }))
                        }
                        className={`py-1.5 rounded text-[11px] border ${
                          (clip.audio?.eqPreset ?? "normal") === eq.id
                            ? "border-[#00AE4D] bg-[#1B212E] text-white"
                            : "border-[#252D3D] bg-[#0B0D11] text-[#94A3B8]"
                        }`}
                      >
                        {eq.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
