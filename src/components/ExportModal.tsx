import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Download,
  Film,
  Loader2,
  X,
} from "lucide-react";
import { ASPECT_RATIO_DIMENSIONS } from "../data/presets";
import { exportProjectToMp4, type ExportResult } from "../engine/mp4Exporter";
import type { ExportProgress, ExportSettings, ProjectState } from "../types/studio";

interface ExportModalProps {
  open: boolean;
  project: ProjectState;
  onClose: () => void;
  onSnapshotCover: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  project,
  onClose,
  onSnapshotCover,
}) => {
  const [settings, setSettings] = useState<ExportSettings>({
    resolution: "1080p",
    fps: 30,
    quality: "high",
    includeAudio: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  if (!open) return null;

  const dims = ASPECT_RATIO_DIMENSIONS[project.aspectRatio];
  const outW = settings.resolution === "1080p" ? dims.width : dims.hdWidth;
  const outH = settings.resolution === "1080p" ? dims.height : dims.hdHeight;

  const handleStartExport = async () => {
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setResult(null);
    setIsExporting(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await exportProjectToMp4(
        project,
        settings,
        (p) => setProgress(p),
        controller.signal
      );
      const url = URL.createObjectURL(res.blob);
      setResult(res);
      setResultUrl(url);
    } catch (err) {
      setProgress({
        phase: "error",
        progress: 0,
        currentFrame: 0,
        totalFrames: 0,
        etaSeconds: 0,
        errorMessage: err instanceof Error ? err.message : "خطا در رندر ویدیو رخ داد.",
      });
    } finally {
      setIsExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsExporting(false);
  };

  const handleDownload = () => {
    if (!result || !resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    const safeName = project.name.replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, "_") || "kadr_reel";
    a.download = `${safeName}.${result.extension}`;
    a.click();
  };

  const handleCopyCaption = async () => {
    if (!project.savedCaption) return;
    try {
      await navigator.clipboard.writeText(project.savedCaption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 1800);
    } catch {
      // ignore
    }
  };

  const phaseLabels: Record<ExportProgress["phase"], string> = {
    preparing: "آماده‌سازی رسانه‌ها و فونت‌ها...",
    audio: "میکس استریوی لایه‌های صدا...",
    rendering: "رندر فریم‌به‌فریم ویدیوی H.264...",
    muxing: "بسته‌بندی نهایی فایل MP4...",
    done: "ویدیوی MP4 آماده دانلود است",
    error: "رندر متوقف شد",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#131720] border border-[#252D3D] rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#252D3D] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-[#00AE4D]" />
            <h2 className="text-sm font-bold text-white">خروجی نهایی ویدیو (MP4 اینستاگرام)</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isExporting) handleCancel();
              onClose();
            }}
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Result Video Preview */}
          {result && resultUrl ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center bg-[#0B0D11] border border-[#252D3D] rounded-lg p-4">
                <video
                  src={resultUrl}
                  controls
                  playsInline
                  className="w-40 max-h-64 rounded-md bg-black border border-[#252D3D] object-contain"
                />
                <div className="flex-1 space-y-2.5 text-xs">
                  <div className="text-sm font-bold text-white">خروجی با موفقیت ساخته شد</div>
                  <div className="text-[#94A3B8] flex flex-wrap items-center gap-2 font-mono-tabular">
                    <span>{result.extension.toUpperCase()}</span>
                    <span>·</span>
                    <span>
                      {result.width}×{result.height}
                    </span>
                    <span>·</span>
                    <span>{(result.blob.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <p className="text-[#94A3B8] leading-relaxed">
                    فایل آماده بارگذاری مستقیم در بخش ریلز و استوری اینستاگرام با کدک استاندارد H.264 است.
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-4 py-2 rounded-lg bg-[#00AE4D] hover:bg-[#22C55E] text-[#0B0D11] font-bold flex items-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>دانلود فایل {result.extension.toUpperCase()}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onSnapshotCover}
                      className="px-3.5 py-2 rounded-lg bg-[#1B212E] hover:bg-[#252D3D] text-[#E2E8F0] font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>دانلود کاور PNG</span>
                    </button>
                    {project.savedCaption && (
                      <button
                        type="button"
                        onClick={handleCopyCaption}
                        className="px-3.5 py-2 rounded-lg bg-[#1B212E] hover:bg-[#252D3D] text-[#E2E8F0] font-medium flex items-center gap-1.5 transition-colors"
                      >
                        {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCaption ? "کپشن کپی شد" : "کپی کپشن ذخیره شده"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setProgress(null);
                  }}
                  className="text-xs text-[#94A3B8] hover:text-white underline"
                >
                  تنظیمات و رندر مجدد
                </button>
              </div>
            </div>
          ) : isExporting && progress ? (
            /* Live Render Progress */
            <div className="space-y-4">
              <div className="flex items-center gap-4 bg-[#0B0D11] border border-[#252D3D] rounded-lg p-4">
                {progress.previewUrl ? (
                  <img
                    src={progress.previewUrl}
                    alt="فریم در حال رندر"
                    className="w-20 h-32 object-cover rounded border border-[#252D3D] shrink-0"
                  />
                ) : (
                  <div className="w-20 h-32 rounded border border-[#252D3D] bg-[#131720] flex items-center justify-center shrink-0">
                    <Loader2 className="w-6 h-6 text-[#00AE4D] animate-spin" />
                  </div>
                )}
                <div className="flex-1 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{phaseLabels[progress.phase]}</span>
                    <span className="font-mono-tabular text-[#00AE4D] font-bold">{progress.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-[#1B212E] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00AE4D] transition-all duration-150"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#94A3B8] font-mono-tabular">
                    <span>
                      فریم {progress.currentFrame} از {progress.totalFrames}
                    </span>
                    <span>زمان باقی‌مانده: ~{progress.etaSeconds} ثانیه</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg bg-[#1B212E] hover:bg-red-500/20 hover:text-red-300 text-xs font-medium text-[#CBD5E1] transition-colors"
                >
                  لغو رندر
                </button>
              </div>
            </div>
          ) : (
            /* Export Configuration Form */
            <div className="space-y-4">
              {progress?.phase === "error" && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {progress.errorMessage}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[#94A3B8] block">رزولوشن خروجی</label>
                  <div className="grid grid-cols-2 gap-1.5 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                    {(["720p", "1080p"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, resolution: r }))}
                        className={`py-1.5 rounded-md text-xs font-medium transition-colors font-mono-tabular ${
                          settings.resolution === r
                            ? "bg-[#1B212E] text-white"
                            : "text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-[#94A3B8] block">نرخ فریم (FPS)</label>
                  <div className="grid grid-cols-3 gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                    {([24, 30, 60] as const).map((fps) => (
                      <button
                        key={fps}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, fps }))}
                        className={`py-1.5 rounded-md text-xs font-medium transition-colors font-mono-tabular ${
                          settings.fps === fps
                            ? "bg-[#1B212E] text-white"
                            : "text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {fps}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#94A3B8] block">کیفیت کدگذاری و بیت‌ریت</label>
                <div className="grid grid-cols-3 gap-1.5 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
                  {[
                    { id: "standard", label: "استاندارد (سریع)" },
                    { id: "high", label: "بالا (پیشنهادی ریلز)" },
                    { id: "ultra", label: "حداکثر سینمایی" },
                  ].map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({ ...s, quality: q.id as ExportSettings["quality"] }))
                      }
                      className={`py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        settings.quality === q.id
                          ? "bg-[#1B212E] text-white"
                          : "text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between p-3 rounded-lg bg-[#0B0D11] border border-[#252D3D] cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-white">خروجی همراه با میکس استریوی صدا (AAC)</div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    شامل موسیقی پس‌زمینه، نریشن میکروفون، اکولایزر و فیدهای صوتی
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.includeAudio}
                  onChange={(e) => setSettings((s) => ({ ...s, includeAudio: e.target.checked }))}
                  className="accent-[#00AE4D] w-4 h-4"
                />
              </label>

              <div className="flex items-center justify-between pt-2 border-t border-[#252D3D]">
                <div className="text-xs text-[#94A3B8] font-mono-tabular">
                  {outW}×{outH} · {settings.fps}fps · MP4 (H.264)
                </div>
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="px-5 py-2.5 rounded-lg bg-[#00AE4D] hover:bg-[#22C55E] text-[#0B0D11] text-xs font-bold flex items-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>شروع رندر و ساخت MP4</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
