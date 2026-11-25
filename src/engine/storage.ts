import type { ProjectState } from "../types/studio";

const STORAGE_KEY = "kadr_studio_projects_v1";
const DRAFT_KEY = "kadr_studio_autosave_v1";

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

export function downloadProjectJson(project: ProjectState) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.name.replace(/\s+/g, "_") || "kadr_project"}.kadr.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
