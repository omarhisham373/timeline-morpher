import { computeSchedule } from "./cpm";
import { successorMap } from "./graph";
import type { Project, Schedule, TaskId } from "./types";

export type ImpactKind = "direct" | "propagated" | "absorbed" | "unchanged";

export interface TaskImpact {
  id: TaskId;
  kind: ImpactKind;
  startShift: number;
  finishShift: number;
  /** Float consumed (positive = less slack than before). */
  slackLost: number;
  /** Hops from the nearest directly-changed task (ripple animation stagger). */
  depth: number;
  /** Chain of tasks that pushed this one, root cause first. */
  causeChain: TaskId[];
}

export interface ImpactReport {
  before: Schedule;
  after: Schedule;
  tasks: Record<TaskId, TaskImpact>;
  finishShift: number;
  /** Directly changed tasks that moved the project finish date. */
  drivers: TaskId[];
}

const EPS = 1e-6;

/**
 * Compare two versions of a project and explain every movement: which tasks
 * were hit directly, which were pushed by a predecessor (and through which
 * chain), and which absorbed the hit in their float.
 */
export function analyzeImpact(beforeProject: Project, afterProject: Project, touched: TaskId[]): ImpactReport {
  const before = computeSchedule(beforeProject);
  const after = computeSchedule(afterProject);
  const succ = successorMap(afterProject.tasks);
  const touchedSet = new Set(touched);

  // BFS depth from the touched tasks across successor links.
  const depth = new Map<TaskId, number>();
  const queue = [...touchedSet];
  touchedSet.forEach((id) => depth.set(id, 0));
  while (queue.length) {
    const id = queue.shift()!;
    for (const s of succ.get(id) ?? []) {
      if (!depth.has(s)) {
        depth.set(s, depth.get(id)! + 1);
        queue.push(s);
      }
    }
  }

  const tasks: Record<TaskId, TaskImpact> = {};
  for (const id of after.order) {
    const a = after.tasks[id];
    const b = before.tasks[id];
    const startShift = b ? round(a.es - b.es) : 0;
    const finishShift = b ? round(a.ef - b.ef) : 0;
    const slackLost = b ? round(b.slack - a.slack) : 0;
    let kind: ImpactKind = "unchanged";
    if (touchedSet.has(id)) kind = "direct";
    else if (finishShift > EPS) kind = "propagated";
    else if (slackLost > EPS && depth.has(id)) kind = "absorbed";

    tasks[id] = {
      id,
      kind,
      startShift,
      finishShift,
      slackLost,
      depth: depth.get(id) ?? 0,
      causeChain: kind === "propagated" ? traceCause(id, after, touchedSet) : kind === "direct" ? [id] : [],
    };
  }

  const finishShift = round(after.finish - before.finish);
  const drivers = finishShift > EPS ? after.criticalPath.filter((id) => touchedSet.has(id)) : [];
  return { before, after, tasks, finishShift, drivers };
}

/** Follow driving predecessors back until we hit a directly changed task. */
function traceCause(id: TaskId, schedule: Schedule, touched: Set<TaskId>): TaskId[] {
  const chain: TaskId[] = [id];
  let cursor = schedule.tasks[id].drivingPredecessor;
  while (cursor) {
    chain.unshift(cursor);
    if (touched.has(cursor)) break;
    cursor = schedule.tasks[cursor].drivingPredecessor;
  }
  return chain;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
