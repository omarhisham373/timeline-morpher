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
 * "Recovery actions recommended": a cheap what-if search. Only work that is
 * still ahead of us counts — critical tasks *downstream* of a reported delay
 * (you can't re-crew yesterday's excavation). For each, simulate adding a
 * second crew (≈ 35 % shorter, at least 1 day) and keep the options that
 * actually pull the finish date back. Real CPM re-runs, not a heuristic guess.
 */
export function suggestRecovery(project: Project, limit = 3): RecoveryOption[] {
  const base = computeSchedule(project);
  const downstream = downstreamOfDelays(project);
  const options: RecoveryOption[] = [];
  for (const id of base.criticalPath) {
    const task = project.tasks.find((t) => t.id === id)!;
    if (!downstream.has(id) || task.durationDays < 2 || task.delayDays > 0) continue;
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

/** Tasks reachable (via successors) from any task carrying a field delay. */
function downstreamOfDelays(project: Project): Set<TaskId> {
  const succ = new Map<TaskId, TaskId[]>(project.tasks.map((t) => [t.id, []]));
  for (const t of project.tasks) for (const d of t.dependsOn) succ.get(d.taskId)?.push(t.id);
  const out = new Set<TaskId>();
  const stack = project.tasks.filter((t) => t.delayDays > 0).map((t) => t.id);
  while (stack.length) {
    for (const s of succ.get(stack.pop()!) ?? []) {
      if (!out.has(s)) {
        out.add(s);
        stack.push(s);
      }
    }
  }
  return out;
}
