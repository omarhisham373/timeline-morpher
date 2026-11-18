"use client";

import { formatShort, pluralDays, workdayToDate } from "@/domain/calendar";
import type { ImpactReport } from "@/domain/impact";
import type { Project, Schedule, TaskId } from "@/domain/types";
import type { ActivityEntry } from "@/state/scheduleReducer";
import { Badge, Button } from "../ui/primitives";
import { sourcesFor } from "./model";

/** "Trace every delay to its source": dates, float, links and the causal chain for one task. */
export function TaskInspector({
  taskId,
  project,
  schedule,
  baseSchedule,
  cumulative,
  activity,
  onClose,
  onSelect,
}: {
  taskId: TaskId;
  project: Project;
  schedule: Schedule;
  baseSchedule: Schedule;
  cumulative: ImpactReport;
  activity: ActivityEntry[];
  onClose: () => void;
  onSelect: (id: TaskId) => void;
}) {
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const s = schedule.tasks[taskId];
  const b = baseSchedule.tasks[taskId];
  const name = (id: TaskId) => project.tasks.find((t) => t.id === id)?.name ?? id;
  const d = (offset: number) => formatShort(workdayToDate(project.startDate, offset));
  const end = (ef: number, es: number) => d(Math.max(es, Math.ceil(ef) - 1));
  const impact = cumulative.tasks[taskId];
  const root = impact?.kind === "propagated" ? impact.causeChain[0] : taskId;
  const sources = impact && impact.kind !== "unchanged" ? sourcesFor(root, activity, name) : [];
  const successors = project.tasks.filter((t) => t.dependsOn.some((x) => x.taskId === taskId));

  return (
    <section className="border-t border-ink-700 bg-ink-800/60 px-4 py-4" aria-label={`Details for ${task.name}`} data-testid="inspector">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-amber uppercase">{task.trade}</p>
          <h3 className="text-base font-semibold text-white">{task.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          {schedule.criticalPath.includes(taskId) ? <Badge tone="amber">Critical</Badge> : <Badge tone="green">{pluralDays(s.slack)} float</Badge>}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close details">
            ✕
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 text-xs sm:grid-cols-3">
        <div>
          <p className="text-faint">Planned</p>
          <p className="font-mono text-white">
            {d(b.es)} → {end(b.ef, b.es)}
          </p>
          <p className="mt-2 text-faint">Forecast</p>
          <p className="font-mono text-white">
            {d(s.es)} → {end(s.ef, s.es)}
            {s.ef > b.ef && <span className="ml-1 text-red-300">(+{Math.round((s.ef - b.ef) * 10) / 10}d)</span>}
          </p>
        </div>
        <div>
          <p className="text-faint">Duration</p>
          <p className="text-white">
            {pluralDays(task.durationDays)} planned{task.delayDays > 0 && <span className="text-red-300"> + {pluralDays(task.delayDays)} field delay</span>}
          </p>
          <p className="mt-2 text-faint">Waits on</p>
          <p className="text-white">
            {task.dependsOn.length
              ? task.dependsOn.map((dep, i) => (
                  <span key={dep.taskId}>
                    {i > 0 && ", "}
                    <button type="button" className="focus-ring underline decoration-ink-500 underline-offset-2 hover:text-amber" onClick={() => onSelect(dep.taskId)}>
                      {name(dep.taskId)}
                    </button>
                    {s.drivingPredecessor === dep.taskId && <span className="text-amber"> (driving)</span>}
                    {dep.lagDays > 0 && <span className="text-faint"> +{dep.lagDays}d lag</span>}
                  </span>
                ))
              : "Nothing — starts the job"}
          </p>
        </div>
        <div>
          <p className="text-faint">Why it moved</p>
          {impact && impact.kind === "propagated" ? (
            <ol className="mt-1 space-y-0.5" data-testid="cause-chain">
              {impact.causeChain.map((id, i) => (
                <li key={id} className="text-white">
                  <span className="text-faint">{i === 0 ? "● " : "↳ "}</span>
                  {name(id)}
                  {i === 0 && project.tasks.find((t) => t.id === id)!.delayDays > 0 && <span className="text-red-300"> +{project.tasks.find((t) => t.id === id)!.delayDays}d</span>}
                </li>
              ))}
            </ol>
          ) : impact?.kind === "direct" ? (
            <p className="text-red-200">Reported directly from the field.</p>
          ) : impact?.kind === "absorbed" ? (
            <p className="text-emerald-300">A predecessor slipped, but this task&apos;s float absorbed it ({pluralDays(impact.slackLost)} of float used).</p>
          ) : (
            <p className="text-mute">On plan.</p>
          )}
          {sources.length > 0 && (
            <ul className="mt-2 space-y-1 border-l-2 border-delay/60 pl-2" data-testid="source-quote">
              {sources.slice(0, 3).map((src, i) => (
                <li key={i} className="text-mute">
                  {src.quote ? <span className="text-white italic">“{src.quote}”</span> : <span className="text-white">Manual edit</span>}
                  <span className="block text-[10px] text-faint">
                    {name(root)} {src.label} · {new Date(src.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {successors.length > 0 && (
            <p className="mt-2 text-faint">
              Feeds: <span className="text-mute">{successors.map((t) => t.name).join(", ")}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
