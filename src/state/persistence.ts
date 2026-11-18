import { computeSchedule } from "@/domain/cpm";
import type { Project } from "@/domain/types";
import type { ActivityEntry } from "./scheduleReducer";

const KEY = "masaro:schedule:v1";

interface Persisted {
  baseline: Project;
  project: Project;
  activity: ActivityEntry[];
}

/** Restore the last session; anything malformed or cyclic is ignored rather than crashing the app. */
export function loadSchedule(expectedProjectId: string): Persisted | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    if (data?.project?.id !== expectedProjectId || !Array.isArray(data.activity)) return null;
    computeSchedule(data.project);
    computeSchedule(data.baseline);
    return data;
  } catch {
    return null;
  }
}

export function saveSchedule(data: Persisted) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: the session still works in memory */
  }
}

export function clearSchedule() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
