"use client";

import { useMemo } from "react";
import { formatShort, pluralDays, workdayToDate } from "@/domain/calendar";
import { suggestRecovery } from "@/domain/recovery";
import type { TaskId } from "@/domain/types";
import { useApp } from "@/state/AppProvider";
import { baselineImpact } from "./timeline/model";
import { Badge, Button, Card } from "./ui/primitives";

/** Delay → impact → recovery: the story Masaro tells, computed from the live schedule. */
export function ImpactPanel() {
  const { schedule: state, applyRecoveryOption } = useApp();
  const { baseline, project } = state;
  const report = useMemo(() => baselineImpact(baseline, project), [baseline, project]);
  const options = useMemo(() => (report.finishShift > 0 ? suggestRecovery(project) : []), [project, report.finishShift]);
  if (report.finishShift <= 0 && !project.tasks.some((t) => t.delayDays > 0)) return null;

  const name = (id: TaskId) => project.tasks.find((t) => t.id === id)?.name ?? id;
  const date = (finish: number) => formatShort(workdayToDate(project.startDate, Math.max(0, Math.ceil(finish) - 1)));
  // Field delays sitting on the (new) critical path are what moved the finish date.
  const drivers = report.after.criticalPath.filter((id) => (project.tasks.find((t) => t.id === id)?.delayDays ?? 0) > 0);
  const absorbed = project.tasks.filter((t) => t.delayDays > 0 && !drivers.includes(t.id));
  const delayOf = (id: TaskId) => project.tasks.find((t) => t.id === id)!.delayDays;

  return (
    <Card id="impact" eyebrow="Impacts & delays identified" title={report.finishShift > 0 ? `Completion moves ${date(report.before.finish)} → ${date(report.after.finish)}` : "Delays absorbed — completion unchanged"}>
      <div className="space-y-4 p-4 text-xs">
        {report.finishShift > 0 && (
          <div>
            <Badge tone="red">+{pluralDays(report.finishShift)}</Badge>
            <p className="mt-2 text-mute" data-testid="driver-chain">
              Critical path now runs{" "}
              {report.after.criticalPath.map((id, i) => (
                <span key={id}>
                  {i > 0 && " → "}
                  <span className={delayOf(id) > 0 ? "font-medium text-red-300" : "text-white"}>
                    {name(id)}
                    {delayOf(id) > 0 && ` (+${delayOf(id)}d)`}
                  </span>
                </span>
              ))}
            </p>
            {absorbed.length > 0 && <p className="mt-1 text-faint">Off the critical path (absorbed by float): {absorbed.map((t) => `${t.name} +${t.delayDays}d`).join(", ")}</p>}
          </div>
        )}
        {options.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-wider text-amber uppercase">Recovery actions recommended</p>
            <ul className="space-y-2" data-testid="recovery-options">
              {options.map((o) => (
                <li key={o.taskId} className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
                  <div>
                    <p className="text-white">{o.action}</p>
                    <p className="text-faint">
                      {o.fromDays} → {o.toDays} days · recovers <span className="text-emerald-300">{pluralDays(o.recoveredDays)}</span> (CPM re-run)
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => applyRecoveryOption(o)}>
                    Try it
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
