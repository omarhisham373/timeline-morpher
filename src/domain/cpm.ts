import { successorMap, topoSort } from "./graph";
import type { Project, Schedule, ScheduledTask, TaskId } from "./types";

const EPS = 1e-9;

/** Effective duration = plan + reported field delay. */
export const effectiveDuration = (t: { durationDays: number; delayDays: number }) =>
  Math.max(0, t.durationDays) + Math.max(0, t.delayDays);

/**
 * Critical Path Method: forward pass for early dates, backward pass for late
 * dates, total float per task and the (first) critical chain.
 */
export function computeSchedule(project: Project): Schedule {
  const tasks = project.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const order = topoSort(tasks);
  const succ = successorMap(tasks);

  const es = new Map<TaskId, number>();
  const ef = new Map<TaskId, number>();
  const driver = new Map<TaskId, TaskId | null>();

  for (const id of order) {
    const t = byId.get(id)!;
    let best = Number.NEGATIVE_INFINITY;
    let drivingPredecessor: TaskId | null = null;
    for (const d of t.dependsOn) {
      const candidate = ef.get(d.taskId)! + d.lagDays;
      if (candidate > best + EPS) {
        best = candidate;
        drivingPredecessor = d.taskId;
      }
    }
    const start = Math.max(0, best);
    es.set(id, start);
    ef.set(id, start + effectiveDuration(t));
    driver.set(id, drivingPredecessor);
  }

  const finish = order.reduce((m, id) => Math.max(m, ef.get(id)!), 0);
  const ls = new Map<TaskId, number>();
  const lf = new Map<TaskId, number>();
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!;
    let lateFinish = finish;
    for (const s of succ.get(id)!) {
      const lag = byId.get(s)!.dependsOn.find((d) => d.taskId === id)!.lagDays;
      lateFinish = Math.min(lateFinish, ls.get(s)! - lag);
    }
    lf.set(id, lateFinish);
    ls.set(id, lateFinish - effectiveDuration(t));
  }

  const result: Record<TaskId, ScheduledTask> = {};
  for (const id of order) {
    const slack = round(ls.get(id)! - es.get(id)!);
    result[id] = {
      id,
      es: round(es.get(id)!),
      ef: round(ef.get(id)!),
      ls: round(ls.get(id)!),
      lf: round(lf.get(id)!),
      slack,
      critical: Math.abs(slack) < 1e-6,
      drivingPredecessor: driver.get(id) ?? null,
    };
  }

  // Walk the chain of driving predecessors back from the latest-finishing task.
  const criticalPath: TaskId[] = [];
  let cursor: TaskId | null =
    [...order].reverse().find((id) => result[id].critical && Math.abs(result[id].ef - finish) < 1e-6) ?? null;
  while (cursor) {
    criticalPath.unshift(cursor);
    cursor = result[cursor].drivingPredecessor;
  }

  return { tasks: result, order, finish: round(finish), criticalPath };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
