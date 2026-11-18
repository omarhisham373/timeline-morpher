"use client";

import { pluralDays } from "@/domain/calendar";
import { useApp } from "@/state/AppProvider";
import { Badge, Card } from "./ui/primitives";

export function ActivityLog() {
  const { schedule } = useApp();
  const name = (id: string) => schedule.project.tasks.find((t) => t.id === id)?.name ?? id;
  return (
    <Card id="activity" eyebrow="Audit trail" title="Every change, traced to the words that caused it">
      {schedule.activity.length === 0 ? (
        <p className="px-4 py-5 text-xs text-mute">Applied notes appear here with the exact quotes they came from.</p>
      ) : (
        <ol className="divide-y divide-ink-700" data-testid="activity-log">
          {schedule.activity.map((a) => (
            <li key={a.id} className="space-y-1 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-faint">{new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <Badge tone={a.source === "recovery" ? "green" : "amber"}>{a.source === "recovery" ? "Recovery" : `Voice · ${a.source}`}</Badge>
                {a.engine && <Badge>{a.engine}</Badge>}
                <Badge tone={a.finishShift > 0 ? "red" : a.finishShift < 0 ? "green" : "neutral"}>{a.finishShift > 0 ? `finish +${pluralDays(a.finishShift)}` : a.finishShift < 0 ? `finish ${a.finishShift}d` : "finish unchanged"}</Badge>
              </div>
              <ul className="text-mute">
                {a.changes.map((c, i) => (
                  <li key={i}>
                    {c.kind === "delay" ? (
                      <>
                        <span className="text-red-200">{name(c.taskId)}</span> +{pluralDays(c.days)}
                      </>
                    ) : (
                      <>
                        <span className="text-sky-200">{name(c.taskId)}</span> now waits on {name(c.dependsOnTaskId)}
                      </>
                    )}
                  </li>
                ))}
                {a.source === "recovery" && <li className="text-emerald-200">{a.title}</li>}
              </ul>
              {a.evidence.length > 0 && a.source !== "recovery" && <p className="text-faint italic">“{a.evidence.join("” · “")}”</p>}
              {a.rejected.length > 0 && <p className="text-amber">Skipped: {a.rejected.map((r) => r.reason).join("; ")}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
