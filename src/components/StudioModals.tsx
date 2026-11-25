import React, { useRef } from "react";
import { Download, FolderOpen, Keyboard, Trash2, Upload, X } from "lucide-react";
import { downloadProjectJson } from "../engine/storage";
import type { ProjectState } from "../types/studio";

interface ProjectsModalProps {
  open: boolean;
  currentProject: ProjectState;
  savedProjects: ProjectState[];
  onClose: () => void;
  onOpenProject: (p: ProjectState) => void;
  onDeleteProject: (id: string) => void;
  onImportProjectJson: (p: ProjectState) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  currentProject,
  savedProjects,
  onClose,
  onOpenProject,
  onDeleteProject,
  onImportProjectJson,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#131720] border border-[#252D3D] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252D3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-bold text-white">مدیریت پروژه‌ها و فایل JSON</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => downloadProjectJson(currentProject)}
              className="py-2.5 px-3 rounded-lg bg-[#1B212E] hover:bg-[#252D3D] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#F97316]" />
              <span>خروجی فایل پروژه (JSON)</span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(String(reader.result));
                    if (parsed && Array.isArray(parsed.tracks) && Array.isArray(parsed.clips)) {
                      onImportProjectJson(parsed);
                      onClose();
                    }
                  } catch {
                    // ignore invalid file
                  }
                };
                reader.readAsText(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="py-2.5 px-3 rounded-lg bg-[#1B212E] hover:bg-[#252D3D] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>بارگذاری فایل پروژه</span>
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#94A3B8]">
              پروژه‌های ذخیره‌شده در مرورگر ({savedProjects.length})
            </div>
            {savedProjects.length === 0 ? (
              <div className="p-6 rounded-lg bg-[#0B0D11] border border-[#252D3D] text-center text-xs text-[#64748B]">
                هنوز پروژه‌ای ذخیره نکرده‌اید. از دکمه «ذخیره» در نوار بالا استفاده کنید.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="p-3 rounded-lg bg-[#0B0D11] border border-[#252D3D] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{proj.name}</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5 font-mono-tabular">
                        {proj.aspectRatio} · {proj.clips.length} کلیپ
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenProject(proj);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-md bg-[#F97316] hover:bg-[#FB923C] text-[#0B0D11] text-[11px] font-bold"
                      >
                        باز کردن
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProject(proj.id)}
                        className="p-1.5 rounded-md text-[#94A3B8] hover:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "Space", desc: "پخش یا توقف ویدیو" },
  { key: "S", desc: "برش (Split) کلیپ انتخاب‌شده در محل هد پخش" },
  { key: "Delete / Backspace", desc: "حذف کلیپ انتخاب‌شده" },
  { key: "Ctrl + Z", desc: "بازگشت به مرحله قبل (Undo)" },
  { key: "Ctrl + Y", desc: "تکرار مرحله بعد (Redo)" },
  { key: "Ctrl + D", desc: "تکثیر کلیپ انتخاب‌شده" },
  { key: "M", desc: "افزودن نشانگر ریتم در زمان فعلی" },
  { key: "← / →", desc: "جابه‌جایی دقیق فریم‌به‌فریم" },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#131720] border border-[#252D3D] rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#252D3D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#F97316]" />
            <h2 className="text-sm font-bold text-white">میانبرهای صفحه‌کلید استودیو</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[#94A3B8] hover:text-white hover:bg-[#1B212E]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 divide-y divide-[#1E2534]">
          {SHORTCUTS.map((item) => (
            <div key={item.key} className="py-2.5 flex items-center justify-between gap-4 text-xs">
              <span className="text-[#CBD5E1]">{item.desc}</span>
              <kbd
                dir="ltr"
                className="px-2 py-1 rounded bg-[#0B0D11] border border-[#252D3D] font-mono-tabular text-[11px] text-[#F97316] shrink-0"
              >
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
