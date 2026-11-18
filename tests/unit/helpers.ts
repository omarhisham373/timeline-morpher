import type { Project, Task } from "@/domain/types";

export function task(id: string, durationDays: number, deps: (string | [string, number])[] = [], extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    trade: "Trade",
    aliases: [],
    durationDays,
    delayDays: 0,
    dependsOn: deps.map((d) => (Array.isArray(d) ? { taskId: d[0], lagDays: d[1] } : { taskId: d, lagDays: 0 })),
    ...extra,
  };
}

export function project(tasks: Task[], startDate = "2026-11-23"): Project {
  return { id: "p", name: "Test", startDate, tasks };
}
