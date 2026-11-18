import { applyChanges } from "@/domain/changes";
import { computeSchedule } from "@/domain/cpm";
import { analyzeImpact, type ImpactReport } from "@/domain/impact";
import type { Project, Schedule, TaskId } from "@/domain/types";

import type { ActivityEntry } from "@/state/scheduleReducer";

export interface ChangeSource {
  at: number;
  label: string;
  quote?: string;
}

/** The field-note quotes that changed this task, newest first: the end of every "why?" chain. */
export function sourcesFor(taskId: TaskId, activity: ActivityEntry[], name: (id: TaskId) => string): ChangeSource[] {
  return activity.flatMap((entry) =>
    entry.changes
      .filter((c) => c.taskId === taskId)
      .map((c) => ({
        at: entry.at,
        label: c.kind === "delay" ? `+${c.days}d` : `now waits on ${name(c.dependsOnTaskId)}${c.lagDays ? ` +${c.lagDays}d` : ""}`,
        quote: c.evidence,
      })),
  );
}

export type BarStatus = "on-plan" | "delayed" | "pushed";

/** Tasks whose own inputs differ from the baseline (delay or new link). */
export function touchedSinceBaseline(baseline: Project, project: Project): TaskId[] {
  return project.tasks
    .filter((t) => {
      const b = baseline.tasks.find((x) => x.id === t.id);
      if (!b) return true;
      return t.delayDays !== b.delayDays || t.durationDays !== b.durationDays || t.dependsOn.length !== b.dependsOn.length;
    })
    .map((t) => t.id);
}

/** Cumulative picture vs. the original plan — used for colours, KPIs and "why did this move?". */
export function baselineImpact(baseline: Project, project: Project): ImpactReport {
  return analyzeImpact(baseline, project, touchedSinceBaseline(baseline, project));
}

export function barStatus(project: Project, schedule: Schedule, base: Schedule, id: TaskId): BarStatus {
  const task = project.tasks.find((t) => t.id === id)!;
  if (task.delayDays > 0) return "delayed";
  const shift = schedule.tasks[id].ef - (base.tasks[id]?.ef ?? schedule.tasks[id].ef);
  return shift > 1e-6 ? "pushed" : "on-plan";
}

export { applyChanges, computeSchedule };
