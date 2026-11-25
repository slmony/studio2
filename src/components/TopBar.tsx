import React, { useState } from "react";
import {
  Camera,
  Download,
  FolderOpen,
  Keyboard,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import { ASPECT_RATIO_DIMENSIONS } from "../data/presets";
import type { AspectRatio } from "../types/studio";

interface TopBarProps {
  projectName: string;
  onRename: (name: string) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveProject: () => void;
  onOpenProjects: () => void;
  onSnapshotCover: () => void;
  onOpenShortcuts: () => void;
  onOpenExport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  onRename,
  aspectRatio,
  onAspectRatioChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSaveProject,
  onOpenProjects,
  onSnapshotCover,
  onOpenShortcuts,
  onOpenExport,
}) => {
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <header className="h-14 shrink-0 bg-[#131720] border-b border-[#252D3D] px-5 flex items-center justify-between gap-8 select-none">
      {/* Zone 1: Brand wordmark + editable project title */}
      <div className="flex items-center gap-4 min-w-0 shrink-0">
        <span
          className="text-lg font-extrabold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0"
          style={{ fontFamily: '"Lalezar", "Vazirmatn", sans-serif' }}
        >
          کادر استودیو
        </span>
        <span className="text-[#334057]" aria-hidden="true">
          /
        </span>
        {editingTitle ? (
          <input
            autoFocus
            value={projectName}
            onChange={(e) => onRename(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
            }}
            className="bg-[#0B0D11] border border-[#F97316] rounded px-2.5 py-1 text-xs text-[#F8FAFC] w-44 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title="ویرایش نام پروژه"
            className="text-xs font-medium text-[#CBD5E1] hover:text-white truncate max-w-[190px] transition-colors whitespace-nowrap"
          >
            {projectName}
          </button>
        )}
      </div>

      {/* Zone 2: Primary workspace actions & aspect ratio selector */}
      <div className="hidden lg:flex items-center gap-5 shrink-0">
        <div className="flex items-center gap-1 bg-[#0B0D11] p-1 rounded-lg border border-[#252D3D]">
          {(Object.keys(ASPECT_RATIO_DIMENSIONS) as AspectRatio[]).map((ratio) => {
            const active = aspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onAspectRatioChange(ratio)}
                title={ASPECT_RATIO_DIMENSIONS[ratio].sub}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-[#1B212E] text-white"
                    : "text-[#94A3B8] hover:text-white"
                }`}
              >
                {ASPECT_RATIO_DIMENSIONS[ratio].label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 border-r border-[#252D3D] pr-4">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="بازگشت (Ctrl+Z)"
            className="p-2 rounded-md text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="تکرار (Ctrl+Y)"
            className="p-2 rounded-md text-[#CBD5E1] hover:bg-[#1B212E] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex items-center gap-4 text-xs font-medium text-[#CBD5E1]">
          <button
            type="button"
            onClick={onSaveProject}
            className="flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>ذخیره</span>
          </button>
          <button
            type="button"
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>پروژه‌ها</span>
          </button>
          <button
            type="button"
            onClick={onSnapshotCover}
            className="flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>کاور PNG</span>
          </button>
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="flex items-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Keyboard className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>میانبرها</span>
          </button>
        </nav>
      </div>

      {/* Zone 3: Single Primary Action CTA */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenExport}
          className="px-4 py-2 rounded-lg bg-[#F97316] hover:bg-[#FB923C] text-[#0B0D11] text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>خروجی MP4</span>
        </button>
      </div>
    </header>
  );
};
