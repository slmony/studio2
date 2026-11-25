import React, { useRef, useState } from "react";
import {
  Check,
  Copy,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Mic,
  Music,
  Palette,
  Play,
  Plus,
  Shapes,
  Sparkles,
  Square,
  Type,
  Upload,
  Wand2,
} from "lucide-react";
import {
  FILTER_PRESETS,
  REEL_TEMPLATES,
  STICKER_PRESETS,
  SYNTH_AUDIO_LIBRARY,
  TEXT_STYLE_PRESETS,
  TRANSITION_OPTIONS,
} from "../data/presets";
import { generateSynthBuffer, getAudioContext } from "../engine/audioSynth";
import type {
  AiCaptionSegment,
  AiScriptResult,
  AiSocialKitResult,
  AiStyleDirectorResult,
  FilterPresetId,
  MediaAsset,
  ShapeKind,
  StickerId,
  SynthTrackId,
  TextStyleConfig,
  TransitionType,
} from "../types/studio";

export type SidebarTab =
  | "templates"
  | "media"
  | "text"
  | "effects"
  | "graphics"
  | "audio"
  | "ai";

interface LibrarySidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  mediaAssets: MediaAsset[];
  onLoadTemplate: (templateId: string) => void;
  onUploadMediaFiles: (files: FileList) => void;
  onAddMediaAssetToTimeline: (asset: MediaAsset) => void;
  onAddTextClip: (presetStyle: Partial<TextStyleConfig>, isCaption?: boolean, customText?: string) => void;
  onAddQuickCaptions: (rawText: string) => void;
  onApplyFilterToSelected: (presetId: FilterPresetId) => void;
  onApplyTransitionToSelected: (transition: TransitionType) => void;
  onAddStickerClip: (stickerId: StickerId, label: string, accent: string) => void;
  onAddShapeClip: (shapeKind: ShapeKind) => void;
  onAddSynthAudio: (synthId: SynthTrackId, name: string, duration: number) => void;
  onAddRecordedVoiceover: (url: string, duration: number, blob: Blob) => void;
  onApplyAiScript: (script: AiScriptResult) => void;
  onApplyAiCaptions: (segments: AiCaptionSegment[]) => void;
  onSaveSocialCaption: (caption: string) => void;
  onApplyAiStyle: (style: AiStyleDirectorResult) => void;
  hasSelectedVisualClip: boolean;
}

const TABS: Array<{ id: SidebarTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "templates", label: "قالب‌ها", icon: LayoutTemplate },
  { id: "media", label: "رسانه", icon: ImageIcon },
  { id: "text", label: "متن", icon: Type },
  { id: "effects", label: "افکت", icon: Palette },
  { id: "graphics", label: "گرافیک", icon: Shapes },
  { id: "audio", label: "صدا", icon: Music },
  { id: "ai", label: "هوش مصنوعی", icon: Sparkles },
];

export const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  activeTab,
  onTabChange,
  mediaAssets,
  onLoadTemplate,
  onUploadMediaFiles,
  onAddMediaAssetToTimeline,
  onAddTextClip,
  onAddQuickCaptions,
  onApplyFilterToSelected,
  onApplyTransitionToSelected,
  onAddStickerClip,
  onAddShapeClip,
  onAddSynthAudio,
  onAddRecordedVoiceover,
  onApplyAiScript,
  onApplyAiCaptions,
  onSaveSocialCaption,
  onApplyAiStyle,
  hasSelectedVisualClip,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick karaoke caption input
  const [quickCaptionText, setQuickCaptionText] = useState("");

  // Microphone voiceover recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recError, setRecError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recStartRef = useRef<number>(0);

  // Synth audio preview
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // AI Studio states
  const [aiSubTab, setAiSubTab] = useState<"script" | "captions" | "social" | "style">("script");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [scriptTopic, setScriptTopic] = useState("");
  const [scriptTone, setScriptTone] = useState("حرفه‌ای و پرانرژی");
  const [scriptDuration, setScriptDuration] = useState(14);
  const [scriptResult, setScriptResult] = useState<AiScriptResult | null>(null);

  const [captionInput, setCaptionInput] = useState("");
  const [captionDuration, setCaptionDuration] = useState(12);
  const [captionSegments, setCaptionSegments] = useState<AiCaptionSegment[] | null>(null);

  const [socialTopic, setSocialTopic] = useState("");
  const [socialResult, setSocialResult] = useState<AiSocialKitResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  const [styleMood, setStyleMood] = useState("");
  const [styleResult, setStyleResult] = useState<AiStyleDirectorResult | null>(null);

  const previewSynth = (synthId: SynthTrackId) => {
    try {
      if (previewSourceRef.current) {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
        previewSourceRef.current = null;
      }
      if (previewingId === synthId) {
        setPreviewingId(null);
        return;
      }
      const ctx = getAudioContext();
      const buf = generateSynthBuffer(synthId, synthId.startsWith("sfx-") ? 1.6 : 4, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => setPreviewingId(null);
      src.start();
      previewSourceRef.current = src;
      setPreviewingId(synthId);
    } catch {
      setPreviewingId(null);
    }
  };

  const toggleVoiceoverRecording = async () => {
    setRecError(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        const dur = Math.max(1, (Date.now() - recStartRef.current) / 1000);
        onAddRecordedVoiceover(url, Number(dur.toFixed(1)), blob);
      };
      recStartRef.current = Date.now();
      setRecSeconds(0);
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recTimerRef.current = window.setInterval(() => {
        setRecSeconds(Math.floor((Date.now() - recStartRef.current) / 1000));
      }, 250);
    } catch {
      setRecError("دسترسی به میکروفون برقرار نشد. لطفاً مجوز مرورگر را بررسی کنید.");
    }
  };

  const callAiEndpoint = async <T,>(url: string, body: Record<string, unknown>): Promise<T | null> => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "خطا در ارتباط با سرویس هوش مصنوعی.");
      }
      return data as T;
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "خطای غیرمنتظره رخ داد.");
      return null;
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(key);
      setTimeout(() => setCopiedIdx(null), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <aside className="w-[336px] shrink-0 bg-[#131720] border-l border-[#252D3D] flex min-h-0 select-none">
      {/* Vertical Tool Icon Rail */}
      <nav className="w-16 shrink-0 bg-[#0F131B] border-l border-[#252D3D] py-2 flex flex-col items-center gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`w-13 py-2 rounded-lg flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
                active
                  ? "bg-[#1B212E] text-[#F97316]"
                  : "text-[#94A3B8] hover:text-white hover:bg-[#161B26]"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="leading-tight text-center">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active Drawer Content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-3.5 space-y-4">
        {/* 1. TEMPLATES TAB */}
        {activeTab === "templates" && (
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-bold text-white">قالب‌های آماده ریلز اینستاگرام</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                کلیک کنید تا پروژه چندلایه با انیمیشن و موزیک بارگذاری شود.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {REEL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onLoadTemplate(tpl.id)}
                  className="group text-right rounded-lg overflow-hidden border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] transition-colors flex flex-col"
                >
                  <div className="aspect-[9/13] w-full overflow-hidden bg-[#1B212E] relative">
                    <img
                      src={tpl.previewImage}
                      alt={tpl.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-2 inset-x-2">
                      <div className="text-[11px] font-bold text-white leading-snug">{tpl.name}</div>
                      <div className="text-[10px] text-[#CBD5E1] mt-0.5">
                        {tpl.category} · <span className="font-mono-tabular">{tpl.duration}s</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. MEDIA TAB */}
        {activeTab === "media" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">کتابخانه ویدیو و تصویر</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                فایل‌های MP4، WebM، JPG یا PNG خود را اضافه کنید.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadMediaFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-3 rounded-lg border border-dashed border-[#334057] hover:border-[#F97316] bg-[#0B0D11] text-xs font-medium text-[#E2E8F0] flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4 text-[#F97316]" />
              <span>آپلود ویدیو یا تصویر از سیستم</span>
            </button>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#94A3B8]">
                پس‌زمینه‌ها و فایل‌های آماده ({mediaAssets.filter((a) => a.kind !== "audio").length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mediaAssets
                  .filter((a) => a.kind !== "audio")
                  .map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onAddMediaAssetToTimeline(asset)}
                      className="group relative rounded-lg overflow-hidden border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-right transition-colors"
                    >
                      <div className="aspect-[9/12] w-full bg-[#1B212E] overflow-hidden relative">
                        {asset.kind === "video" ? (
                          <video
                            src={asset.src}
                            muted
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={asset.src}
                            alt={asset.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                        <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                        <div className="absolute bottom-1.5 inset-x-1.5 text-[10px] font-medium text-white truncate">
                          {asset.name}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. TEXT & CAPTIONS TAB */}
        {activeTab === "text" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">تایپوگرافی و زیرنویس پویا</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                استایل دلخواه را به محل فعلی هد پخش اضافه کنید.
              </p>
            </div>

            <div className="space-y-2">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    onAddTextClip(preset.style, preset.id === "karaoke-caption")
                  }
                  className="w-full p-3 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-right flex items-center justify-between gap-2 transition-colors"
                >
                  <div>
                    <div
                      className="text-sm font-bold text-white"
                      style={{ fontFamily: `"${preset.style.fontFamily || "Vazirmatn"}", sans-serif` }}
                    >
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">
                      {preset.id === "karaoke-caption"
                        ? "هایلایت کلمه‌به‌کلمه هماهنگ با زمان"
                        : `فونت ${preset.style.fontFamily || "Vazirmatn"}`}
                    </div>
                  </div>
                  <Plus className="w-4 h-4 text-[#F97316] shrink-0" />
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[#252D3D] space-y-2">
              <label className="text-xs font-semibold text-white block">
                ساخت سریع زیرنویس کارائوکه (خط‌به‌خط)
              </label>
              <textarea
                rows={4}
                value={quickCaptionText}
                onChange={(e) => setQuickCaptionText(e.target.value)}
                placeholder="هر جمله را در یک خط بنویسید تا خودکار روی تایم‌لاین زیرنویس شود..."
                className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#F97316] p-2.5 text-xs text-white placeholder-[#64748B] outline-none resize-none"
              />
              <button
                type="button"
                disabled={!quickCaptionText.trim()}
                onClick={() => {
                  onAddQuickCaptions(quickCaptionText);
                  setQuickCaptionText("");
                }}
                className="w-full py-2 rounded-lg bg-[#1B212E] hover:bg-[#F97316] hover:text-[#0B0D11] disabled:opacity-40 text-xs font-semibold text-white transition-colors"
              >
                افزودن خودکار زیرنویس‌ها به تایم‌لاین
              </button>
            </div>
          </div>
        )}

        {/* 4. EFFECTS & TRANSITIONS TAB */}
        {activeTab === "effects" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">فیلترهای سینمایی (LUT)</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                {hasSelectedVisualClip
                  ? "روی کلیپ انتخاب‌شده اعمال می‌شود."
                  : "روی تمام کلیپ‌های ویدیو/تصویر فعلی اعمال می‌شود."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {FILTER_PRESETS.map((fp) => (
                <button
                  key={fp.id}
                  type="button"
                  onClick={() => onApplyFilterToSelected(fp.id)}
                  className="p-2 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-right transition-colors flex items-center gap-2"
                >
                  <span
                    className="w-7 h-7 rounded-md shrink-0 border border-white/10"
                    style={{ background: fp.swatch }}
                  />
                  <span className="text-[11px] font-medium text-[#E2E8F0] truncate">{fp.name}</span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[#252D3D] space-y-2.5">
              <h4 className="text-xs font-bold text-white">ترنزیشن ورود صحنه</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {TRANSITION_OPTIONS.map((tr) => (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => onApplyTransitionToSelected(tr.id)}
                    className="py-2 px-2.5 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-[11px] font-medium text-[#CBD5E1] hover:text-white text-right transition-colors truncate"
                  >
                    {tr.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. GRAPHICS & STICKERS TAB */}
        {activeTab === "graphics" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">استیکرها و کال‌تواکشن اینستاگرام</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                المان‌های برداری باکیفیت 1080p قابل ویرایش متن و رنگ
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {STICKER_PRESETS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onAddStickerClip(st.id, st.defaultLabel, st.accent)}
                  className="p-2.5 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-right transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white truncate">{st.name}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: st.accent }}
                    />
                  </div>
                  <div className="text-[10px] text-[#94A3B8] truncate">{st.defaultLabel}</div>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-[#252D3D] space-y-2">
              <h4 className="text-xs font-bold text-white">اشکال هندسی و لایه خوانایی</h4>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { kind: "gradient-scrim" as const, label: "گرادیان تیره متن" },
                  { kind: "rect" as const, label: "کادر مستطیل" },
                  { kind: "circle" as const, label: "دایره گرافیکی" },
                  { kind: "line" as const, label: "خط جداکننده" },
                ].map((sh) => (
                  <button
                    key={sh.kind}
                    type="button"
                    onClick={() => onAddShapeClip(sh.kind)}
                    className="py-2.5 px-3 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-[11px] font-medium text-[#E2E8F0] transition-colors"
                  >
                    {sh.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 6. AUDIO & VOICEOVER TAB */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-white">موسیقی، افکت صوتی و ضبط نریشن</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                تمام صداها با کیفیت استریو وارد فایل خروجی MP4 می‌شوند.
              </p>
            </div>

            <input
              ref={audioFileInputRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onUploadMediaFiles(e.target.files);
                  e.target.value = "";
                }
              }}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => audioFileInputRef.current?.click()}
                className="py-2.5 px-2.5 rounded-lg border border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-xs font-medium text-[#E2E8F0] flex items-center justify-center gap-1.5 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-[#34D399]" />
                <span>آپلود MP3/WAV</span>
              </button>

              <button
                type="button"
                onClick={toggleVoiceoverRecording}
                className={`py-2.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isRecording
                    ? "bg-red-500/20 border-red-500 text-red-300"
                    : "border-[#252D3D] hover:border-[#F97316] bg-[#0B0D11] text-[#E2E8F0]"
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span className="font-mono-tabular">توقف ({recSeconds}s)</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-[#F97316]" />
                    <span>ضبط نریشن</span>
                  </>
                )}
              </button>
            </div>

            {recError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300">
                {recError}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#94A3B8]">موزیک‌های آماده بدون کپی‌رایت</div>
              {SYNTH_AUDIO_LIBRARY.filter((s) => s.category === "music").map((tr) => (
                <div
                  key={tr.id}
                  className="p-2.5 rounded-lg border border-[#252D3D] bg-[#0B0D11] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{tr.name}</div>
                    <div className="text-[10px] text-[#94A3B8] truncate">
                      {tr.description} · <span className="font-mono-tabular">{tr.duration}s</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => previewSynth(tr.id)}
                      title="پیش‌شنید"
                      className={`p-1.5 rounded-md ${
                        previewingId === tr.id
                          ? "bg-[#F97316] text-[#0B0D11]"
                          : "bg-[#1B212E] text-[#CBD5E1] hover:text-white"
                      }`}
                    >
                      {previewingId === tr.id ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddSynthAudio(tr.id, tr.name, tr.duration)}
                      title="افزودن به تایم‌لاین"
                      className="p-1.5 rounded-md bg-[#1B212E] hover:bg-[#34D399] hover:text-[#0B0D11] text-[#34D399] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t border-[#252D3D]">
              <div className="text-[11px] font-semibold text-[#94A3B8]">افکت‌های صوتی (SFX)</div>
              {SYNTH_AUDIO_LIBRARY.filter((s) => s.category === "sfx").map((tr) => (
                <div
                  key={tr.id}
                  className="p-2 rounded-lg border border-[#252D3D] bg-[#0B0D11] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white truncate">{tr.name}</div>
                    <div className="text-[10px] text-[#94A3B8] truncate">{tr.description}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => previewSynth(tr.id)}
                      className={`p-1.5 rounded-md ${
                        previewingId === tr.id
                          ? "bg-[#F97316] text-[#0B0D11]"
                          : "bg-[#1B212E] text-[#CBD5E1] hover:text-white"
                      }`}
                    >
                      <Play className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddSynthAudio(tr.id, tr.name, tr.duration)}
                      className="p-1.5 rounded-md bg-[#1B212E] hover:bg-[#34D399] hover:text-[#0B0D11] text-[#34D399]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. AI STUDIO TAB */}
        {activeTab === "ai" && (
          <div className="space-y-3.5">
            <div>
              <h3 className="text-xs font-bold text-white">دستیار هوش مصنوعی اینستاگرام</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                تولید سناریو، زیرنویس زمان‌بندی‌شده، کپشن و کارگردانی رنگ
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
              {[
                { id: "script" as const, label: "سناریوساز ریلز" },
                { id: "captions" as const, label: "زیرنویس هوشمند" },
                { id: "social" as const, label: "کپشن و هوک" },
                { id: "style" as const, label: "کارگردان استایل" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setAiSubTab(st.id);
                    setAiError(null);
                  }}
                  className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                    aiSubTab === st.id
                      ? "bg-[#1B212E] text-[#F97316]"
                      : "text-[#94A3B8] hover:text-white"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {aiError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300 leading-relaxed">
                {aiError}
              </div>
            )}

            {/* Sub-tab 1: Script to Timeline */}
            {aiSubTab === "script" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[#94A3B8] block">موضوع ریلز شما چیست؟</label>
                  <textarea
                    rows={3}
                    value={scriptTopic}
                    onChange={(e) => setScriptTopic(e.target.value)}
                    placeholder="مثلاً: معرفی دوره عکاسی موبایل با ۳ تکنیک نورپردازی خانگی..."
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#F97316] p-2.5 text-xs text-white placeholder-[#64748B] outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#94A3B8] block">لحن محتوا</label>
                    <select
                      value={scriptTone}
                      onChange={(e) => setScriptTone(e.target.value)}
                      className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-[11px] text-white outline-none"
                    >
                      <option>حرفه‌ای و پرانرژی</option>
                      <option>لوکس و مینیمال</option>
                      <option>صمیمی و آموزشی</option>
                      <option>تبلیغاتی و فروشگاهی</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#94A3B8] block">مدت هدف (ثانیه)</label>
                    <input
                      type="number"
                      min={8}
                      max={45}
                      value={scriptDuration}
                      onChange={(e) => setScriptDuration(Number(e.target.value))}
                      className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] p-2 text-[11px] text-white font-mono-tabular outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={aiLoading || !scriptTopic.trim()}
                  onClick={async () => {
                    const data = await callAiEndpoint<AiScriptResult>("/api/ai/script", {
                      topic: scriptTopic,
                      tone: scriptTone,
                      durationSeconds: scriptDuration,
                    });
                    if (data) setScriptResult(data);
                  }}
                  className="w-full py-2.5 rounded-lg bg-[#F97316] hover:bg-[#FB923C] disabled:opacity-40 text-[#0B0D11] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  <span>تولید سناریو و صحنه‌بندی</span>
                </button>

                {scriptResult && (
                  <div className="p-3 rounded-lg bg-[#0B0D11] border border-[#252D3D] space-y-2.5 text-xs">
                    <div className="font-bold text-white">{scriptResult.projectTitle}</div>
                    <div className="text-[11px] text-[#F97316]">هوک: {scriptResult.hookText}</div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {scriptResult.scenes.map((sc, i) => (
                        <div key={i} className="p-2 rounded bg-[#131720] border border-[#1E2534] space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                            <span>
                              {i + 1}. {sc.headline}
                            </span>
                            <span className="font-mono-tabular text-[#94A3B8]">{sc.duration}s</span>
                          </div>
                          <div className="text-[10px] text-[#94A3B8]">{sc.caption}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyAiScript(scriptResult)}
                      className="w-full py-2 rounded-lg bg-[#10B981] hover:bg-[#34D399] text-[#0B0D11] font-bold text-xs transition-colors"
                    >
                      ساخت خودکار صحنه‌ها روی تایم‌لاین
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 2: Auto Timed Captions */}
            {aiSubTab === "captions" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[#94A3B8] block">متن گفتاری ویدیو را وارد کنید</label>
                  <textarea
                    rows={4}
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="متن کامل صحبت‌های ریلز را اینجا بنویسید تا به زیرنویس کارائوکه زمان‌بندی‌شده تبدیل شود..."
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#F97316] p-2.5 text-xs text-white placeholder-[#64748B] outline-none resize-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-[#94A3B8]">مدت زمان کل (ثانیه)</label>
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={captionDuration}
                    onChange={(e) => setCaptionDuration(Number(e.target.value))}
                    className="w-20 rounded-lg bg-[#0B0D11] border border-[#252D3D] p-1.5 text-xs text-white font-mono-tabular outline-none text-center"
                  />
                </div>
                <button
                  type="button"
                  disabled={aiLoading || !captionInput.trim()}
                  onClick={async () => {
                    const data = await callAiEndpoint<{ segments: AiCaptionSegment[] }>(
                      "/api/ai/captions",
                      { scriptText: captionInput, totalDuration: captionDuration }
                    );
                    if (data?.segments) setCaptionSegments(data.segments);
                  }}
                  className="w-full py-2.5 rounded-lg bg-[#F97316] hover:bg-[#FB923C] disabled:opacity-40 text-[#0B0D11] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>زمان‌بندی هوشمند زیرنویس‌ها</span>
                </button>

                {captionSegments && captionSegments.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#0B0D11] border border-[#252D3D] space-y-2">
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {captionSegments.map((seg, i) => (
                        <div key={i} className="text-[11px] text-[#E2E8F0] flex items-start justify-between gap-2 py-1 border-b border-[#1E2534] last:border-0">
                          <span>{seg.text}</span>
                          <span className="font-mono-tabular text-[10px] text-[#94A3B8] shrink-0">
                            {seg.start.toFixed(1)}s
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyAiCaptions(captionSegments)}
                      className="w-full py-2 rounded-lg bg-[#10B981] hover:bg-[#34D399] text-[#0B0D11] font-bold text-xs transition-colors"
                    >
                      تزریق {captionSegments.length} زیرنویس به تایم‌لاین
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 3: Social Kit */}
            {aiSubTab === "social" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[#94A3B8] block">موضوع ویدیو برای کپشن و هوک</label>
                  <input
                    value={socialTopic}
                    onChange={(e) => setSocialTopic(e.target.value)}
                    placeholder="مثلاً: رونمایی از کالکشن پاییزه کیف چرم..."
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#F97316] p-2.5 text-xs text-white placeholder-[#64748B] outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={aiLoading || !socialTopic.trim()}
                  onClick={async () => {
                    const data = await callAiEndpoint<AiSocialKitResult>("/api/ai/social-kit", {
                      topic: socialTopic,
                    });
                    if (data) setSocialResult(data);
                  }}
                  className="w-full py-2.5 rounded-lg bg-[#F97316] hover:bg-[#FB923C] disabled:opacity-40 text-[#0B0D11] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>تولید کپشن، هشتگ و هوک وایرال</span>
                </button>

                {socialResult && (
                  <div className="space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#94A3B8]">هوک‌های ۳ ثانیه اول (کلیک برای افزودن به بوم)</div>
                      {socialResult.hooks.map((hook, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onAddTextClip({ fontFamily: "Lalezar", fontSize: 78 }, false, hook)}
                          className="w-full text-right p-2 rounded-lg bg-[#0B0D11] border border-[#252D3D] hover:border-[#F97316] text-[11px] text-[#E2E8F0] transition-colors"
                        >
                          {hook}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-[#94A3B8]">کپشن‌های آماده</div>
                      {socialResult.captions.map((cap, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-[#0B0D11] border border-[#252D3D] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#F97316]">{cap.style}</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onSaveSocialCaption(`${cap.text}\n\n${socialResult.hashtags.join(" ")}`)}
                                className="text-[10px] text-[#34D399] hover:underline"
                              >
                                ذخیره در پروژه
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(`cap-${i}`, `${cap.text}\n\n${socialResult.hashtags.join(" ")}`)}
                                className="text-[#94A3B8] hover:text-white"
                              >
                                {copiedIdx === `cap-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-[#CBD5E1] leading-relaxed whitespace-pre-line">
                            {cap.text}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0B0D11] border border-[#252D3D] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#94A3B8]">هشتگ‌ها</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText("tags", socialResult.hashtags.join(" "))}
                          className="text-[10px] text-[#F97316] hover:underline"
                        >
                          {copiedIdx === "tags" ? "کپی شد" : "کپی همه"}
                        </button>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                        {socialResult.hashtags.join(" ")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 4: Style Director */}
            {aiSubTab === "style" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-[#94A3B8] block">حس‌وحال دلخواه ویدیو را توصیف کنید</label>
                  <textarea
                    rows={3}
                    value={styleMood}
                    onChange={(e) => setStyleMood(e.target.value)}
                    placeholder="مثلاً: تیره و مرموز شبیه تبلیغات عطر فرانسوی با ریتم آرام..."
                    className="w-full rounded-lg bg-[#0B0D11] border border-[#252D3D] focus:border-[#F97316] p-2.5 text-xs text-white placeholder-[#64748B] outline-none resize-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={aiLoading || !styleMood.trim()}
                  onClick={async () => {
                    const data = await callAiEndpoint<AiStyleDirectorResult>("/api/ai/style-director", {
                      mood: styleMood,
                    });
                    if (data) setStyleResult(data);
                  }}
                  className="w-full py-2.5 rounded-lg bg-[#F97316] hover:bg-[#FB923C] disabled:opacity-40 text-[#0B0D11] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                  <span>پیشنهاد کارگردانی رنگ و استایل</span>
                </button>

                {styleResult && (
                  <div className="p-3 rounded-lg bg-[#0B0D11] border border-[#252D3D] space-y-2.5 text-xs">
                    <div className="font-bold text-white">{styleResult.styleName}</div>
                    <p className="text-[11px] text-[#94A3B8] leading-relaxed">{styleResult.rationale}</p>
                    <div className="text-[11px] text-[#CBD5E1] space-y-1">
                      <div>فیلتر: {styleResult.filterPreset} · فونت: {styleResult.fontFamily}</div>
                      <div>ترنزیشن: {styleResult.transition} · موزیک: {styleResult.musicId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onApplyAiStyle(styleResult)}
                      className="w-full py-2 rounded-lg bg-[#10B981] hover:bg-[#34D399] text-[#0B0D11] font-bold text-xs transition-colors"
                    >
                      اعمال یک‌کلیکی روی پروژه
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
