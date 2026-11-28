import type { ProjectState } from "../types/studio";

const STORAGE_KEY = "kadr_studio_projects_v1";
const DRAFT_KEY = "kadr_studio_autosave_v14";
const LEGACY_DRAFT_KEY = "kadr_studio_autosave_v5";
const PREV_ELUMINA_DRAFT_KEY = "kadr_studio_autosave_v10";
const PREV_DOLPHIN_DRAFT_KEY = "kadr_studio_autosave_v13";
const ARCHIVED_ESKIMO_FLAG = "kadr_archived_eskimo_v1";
const ARCHIVED_ELUMINA_FLAG = "kadr_archived_elumina_v1";
const ARCHIVED_DOLPHIN_FLAG = "kadr_archived_dolphin_v1";

export function loadSavedProjects(): ProjectState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectToLibrary(project: ProjectState): ProjectState[] {
  const list = loadSavedProjects();
  const updated: ProjectState = { ...project, updatedAt: Date.now() };
  const idx = list.findIndex((p) => p.id === updated.id);
  if (idx >= 0) {
    list[idx] = updated;
  } else {
    list.unshift(updated);
  }
  const trimmed = list.slice(0, 20);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors
  }
  return trimmed;
}

export function deleteProjectFromLibrary(projectId: string): ProjectState[] {
  const list = loadSavedProjects().filter((p) => p.id !== projectId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return list;
}

export function saveDraftProject(project: ProjectState) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export function loadDraftProject(): ProjectState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.id && Array.isArray(parsed.tracks) && Array.isArray(parsed.clips)) {
      return parsed as ProjectState;
    }
    return null;
  } catch {
    return null;
  }
}

export function bootstrapStudioWorkspace(
  buildEskimoFallback: () => ProjectState,
  buildEluminaFallback: () => ProjectState,
  buildDolphinFallback: () => ProjectState,
  buildNewProductProject: () => ProjectState
): { activeProject: ProjectState; savedProjects: ProjectState[] } {
  try {
    if (!localStorage.getItem(ARCHIVED_ESKIMO_FLAG)) {
      let eskimoProject: ProjectState | null = null;
      const legacyRaw = localStorage.getItem(LEGACY_DRAFT_KEY);
      if (legacyRaw) {
        try {
          const parsed = JSON.parse(legacyRaw);
          if (
            parsed &&
            parsed.id === "proj-eskimo-dome-50s" &&
            Array.isArray(parsed.tracks) &&
            Array.isArray(parsed.clips)
          ) {
            eskimoProject = { ...(parsed as ProjectState), name: "گوی تعاملی اسکیمو" };
          }
        } catch {
          // fallback below
        }
      }
      if (!eskimoProject) {
        eskimoProject = { ...buildEskimoFallback(), name: "گوی تعاملی اسکیمو" };
      }

      saveProjectToLibrary(eskimoProject);
      localStorage.setItem(ARCHIVED_ESKIMO_FLAG, "1");
    }

    if (!localStorage.getItem(ARCHIVED_ELUMINA_FLAG)) {
      let eluminaProject: ProjectState | null = null;
      const prevRaw = localStorage.getItem(PREV_ELUMINA_DRAFT_KEY);
      if (prevRaw) {
        try {
          const parsed = JSON.parse(prevRaw);
          if (
            parsed &&
            parsed.id === "proj-elumina-tree-50s" &&
            Array.isArray(parsed.tracks) &&
            Array.isArray(parsed.clips)
          ) {
            eluminaProject = { ...(parsed as ProjectState), name: "درخت نوری ایلومینا" };
          }
        } catch {
          // fallback below
        }
      }
      if (!eluminaProject) {
        eluminaProject = { ...buildEluminaFallback(), name: "درخت نوری ایلومینا" };
      }

      saveProjectToLibrary(eluminaProject);
      localStorage.setItem(ARCHIVED_ELUMINA_FLAG, "1");
    }

    if (!localStorage.getItem(ARCHIVED_DOLPHIN_FLAG)) {
      let dolphinProject: ProjectState | null = null;
      const prevDolphinRaw = localStorage.getItem(PREV_DOLPHIN_DRAFT_KEY);
      if (prevDolphinRaw) {
        try {
          const parsed = JSON.parse(prevDolphinRaw);
          if (
            parsed &&
            parsed.id === "proj-chabahar-dolphin-50s" &&
            Array.isArray(parsed.tracks) &&
            Array.isArray(parsed.clips)
          ) {
            dolphinProject = { ...(parsed as ProjectState), name: "تونل نوری دلفینی چابهار" };
          }
        } catch {
          // fallback below
        }
      }
      if (!dolphinProject) {
        dolphinProject = { ...buildDolphinFallback(), name: "تونل نوری دلفینی چابهار" };
      }

      const saved = saveProjectToLibrary(dolphinProject);
      const freshProject = buildNewProductProject();
      saveDraftProject(freshProject);
      localStorage.setItem(ARCHIVED_DOLPHIN_FLAG, "1");
      return { activeProject: freshProject, savedProjects: saved };
    }
  } catch {
    // Ignore storage access errors
  }

  return {
    activeProject: loadDraftProject() ?? buildNewProductProject(),
    savedProjects: loadSavedProjects(),
  };
}

export function downloadProjectJson(project: ProjectState) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, "_") || "kadr_project"}.kadr.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
