import { computeSchedule } from "./cpm";
import type { Project, TaskId } from "./types";

export interface RecoveryOption {
  taskId: TaskId;
  /** Planned duration before / after crashing. */
  fromDays: number;
  toDays: number;
  /** Working days the project finish moves earlier. */
  recoveredDays: number;
  action: string;
}

/**
 * "Recovery actions recommended": a cheap what-if search. For every critical
 * task that has not yet slipped itself, simulate adding a second crew
 * (≈ 35 % shorter, at least 1 day) and keep the options that actually pull the
 * finish date back. Real CPM re-runs, not a heuristic guess.
 */
export function suggestRecovery(project: Project, limit = 3): RecoveryOption[] {
  const base = computeSchedule(project);
  const options: RecoveryOption[] = [];
  for (const id of base.criticalPath) {
    const task = project.tasks.find((t) => t.id === id)!;
    if (task.durationDays < 2 || task.delayDays > 0) continue;
    const toDays = Math.max(1, Math.round(task.durationDays * 0.65));
    if (toDays >= task.durationDays) continue;
    const variant: Project = {
      ...project,
      tasks: project.tasks.map((t) => (t.id === id ? { ...t, durationDays: toDays } : t)),
    };
    const recoveredDays = Math.round((base.finish - computeSchedule(variant).finish) * 100) / 100;
    if (recoveredDays > 0) {
      options.push({
        taskId: id,
        fromDays: task.durationDays,
        toDays,
        recoveredDays,
        action: `Add a second ${task.trade.toLowerCase()} crew to ${task.name}`,
      });
    }
  }
  return options.sort((a, b) => b.recoveredDays - a.recoveredDays).slice(0, limit);
}

/** Apply a recovery option (shortens planned duration). */
export function applyRecovery(project: Project, option: RecoveryOption): Project {
  return {
    ...project,
    tasks: project.tasks.map((t) => (t.id === option.taskId ? { ...t, durationDays: option.toDays } : t)),
  };
}
