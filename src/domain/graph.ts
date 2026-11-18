import type { Task, TaskId } from "./types";

export class CycleError extends Error {
  constructor(public readonly cycle: TaskId[]) {
    super(`Dependency cycle: ${cycle.join(" → ")}`);
    this.name = "CycleError";
  }
}

export class UnknownTaskError extends Error {
  constructor(public readonly taskId: TaskId, public readonly referencedBy: TaskId) {
    super(`Task "${referencedBy}" depends on unknown task "${taskId}"`);
    this.name = "UnknownTaskError";
  }
}

/** successors[id] = tasks that depend on id */
export function successorMap(tasks: Task[]): Map<TaskId, TaskId[]> {
  const succ = new Map<TaskId, TaskId[]>(tasks.map((t) => [t.id, []]));
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      const list = succ.get(d.taskId);
      if (!list) throw new UnknownTaskError(d.taskId, t.id);
      list.push(t.id);
    }
  }
  return succ;
}

/**
 * Kahn topological sort. Ties are broken by the original task order so the
 * timeline rows stay stable. Throws `CycleError` with the offending loop.
 */
export function topoSort(tasks: Task[]): TaskId[] {
  const succ = successorMap(tasks);
  const indexOf = new Map(tasks.map((t, i) => [t.id, i]));
  const indeg = new Map(tasks.map((t) => [t.id, new Set(t.dependsOn.map((d) => d.taskId)).size]));
  const ready = tasks.filter((t) => indeg.get(t.id) === 0).map((t) => t.id);
  const order: TaskId[] = [];
  while (ready.length) {
    ready.sort((a, b) => indexOf.get(a)! - indexOf.get(b)!);
    const id = ready.shift()!;
    order.push(id);
    for (const s of new Set(succ.get(id))) {
      const n = indeg.get(s)! - 1;
      indeg.set(s, n);
      if (n === 0) ready.push(s);
    }
  }
  if (order.length !== tasks.length) throw new CycleError(findCycle(tasks));
  return order;
}

/** Wouldn't adding `from` → depends on `on` create a cycle? */
export function wouldCreateCycle(tasks: Task[], taskId: TaskId, dependsOnId: TaskId): boolean {
  if (taskId === dependsOnId) return true;
  // A cycle appears if `taskId` is already an ancestor of `dependsOnId`.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const stack = [dependsOnId];
  const seen = new Set<TaskId>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of byId.get(id)?.dependsOn ?? []) stack.push(d.taskId);
  }
  return false;
}

function findCycle(tasks: Task[]): TaskId[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<TaskId, 1 | 2>();
  const path: TaskId[] = [];
  const visit = (id: TaskId): TaskId[] | null => {
    state.set(id, 1);
    path.push(id);
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (state.get(d.taskId) === 1) return [...path.slice(path.indexOf(d.taskId)), d.taskId];
      if (!state.has(d.taskId)) {
        const c = visit(d.taskId);
        if (c) return c;
      }
    }
    path.pop();
    state.set(id, 2);
    return null;
  };
  for (const t of tasks) {
    if (!state.has(t.id)) {
      const c = visit(t.id);
      if (c) return c.reverse();
    }
  }
  return [];
}
