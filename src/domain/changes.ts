import { wouldCreateCycle } from "./graph";
import type { Project, TaskId } from "./types";

/**
 * A schedule change the reviewer has accepted. This is the domain-level shape;
 * the parser's zod schema (src/parsing/schema.ts) maps onto it.
 */
export type ScheduleChange =
  | { kind: "delay"; taskId: TaskId; days: number; reason: string; evidence?: string }
  | { kind: "dependency"; taskId: TaskId; dependsOnTaskId: TaskId; lagDays: number; reason: string; evidence?: string };

export interface RejectedChange {
  change: ScheduleChange;
  reason: string;
}

export interface ApplyResult {
  project: Project;
  applied: ScheduleChange[];
  rejected: RejectedChange[];
  /** Tasks whose own inputs changed (used as ripple origins). */
  touched: TaskId[];
}

export const MAX_DELAY_DAYS = 60;

/**
 * Apply changes immutably. Every change is validated against the *current*
 * project (including changes applied earlier in the same batch), so a batch can
 * never introduce a cycle or reference a task that does not exist.
 */
export function applyChanges(project: Project, changes: ScheduleChange[]): ApplyResult {
  let tasks = project.tasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn] }));
  const applied: ScheduleChange[] = [];
  const rejected: RejectedChange[] = [];
  const touched = new Set<TaskId>();
  const has = (id: TaskId) => tasks.some((t) => t.id === id);

  for (const change of changes) {
    const reject = (reason: string) => rejected.push({ change, reason });
    if (!has(change.taskId)) {
      reject(`Unknown task "${change.taskId}"`);
      continue;
    }
    if (change.kind === "delay") {
      if (!Number.isFinite(change.days) || change.days <= 0) {
        reject("Delay must be a positive number of days");
        continue;
      }
      if (change.days > MAX_DELAY_DAYS) {
        reject(`Delay over ${MAX_DELAY_DAYS} days looks like a transcription error`);
        continue;
      }
      tasks = tasks.map((t) =>
        t.id === change.taskId ? { ...t, delayDays: round(t.delayDays + change.days) } : t,
      );
    } else {
      if (!has(change.dependsOnTaskId)) {
        reject(`Unknown task "${change.dependsOnTaskId}"`);
        continue;
      }
      const task = tasks.find((t) => t.id === change.taskId)!;
      if (task.dependsOn.some((d) => d.taskId === change.dependsOnTaskId)) {
        reject("Already linked in the schedule");
        continue;
      }
      if (wouldCreateCycle(tasks, change.taskId, change.dependsOnTaskId)) {
        reject("Would create a circular dependency");
        continue;
      }
      if (!Number.isFinite(change.lagDays) || change.lagDays < 0) {
        reject("Lag must be zero or positive");
        continue;
      }
      tasks = tasks.map((t) =>
        t.id === change.taskId
          ? { ...t, dependsOn: [...t.dependsOn, { taskId: change.dependsOnTaskId, lagDays: change.lagDays }] }
          : t,
      );
    }
    applied.push(change);
    touched.add(change.taskId);
  }
  return { project: { ...project, tasks }, applied, rejected, touched: [...touched] };
}

const round = (n: number) => Math.round(n * 100) / 100;
