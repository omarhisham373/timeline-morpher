"use client";

import { useMemo, useState } from "react";
import { formatShort, pluralDays, workdayToDate } from "@/domain/calendar";
import { computeSchedule } from "@/domain/cpm";
import { applyChanges } from "@/domain/changes";
import type { TaskId } from "@/domain/types";
import { useApp } from "@/state/AppProvider";
import { includedChanges } from "@/state/review";
import { Card, Switch, cx } from "../ui/primitives";
import { Gantt } from "./Gantt";
import { TaskInspector } from "./TaskInspector";
import { baselineImpact } from "./model";

export function TimelinePanel() {
  const { schedule: state, review } = useApp();
  const { project, baseline, impact, rippleSeq } = state;
  const [showCritical, setShowCritical] = useState(true);
  const [showSlack, setShowSlack] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [selectedId, setSelectedId] = useState<TaskId | null>(null);

  const schedule = useMemo(() => computeSchedule(project), [project]);
  const baseSchedule = useMemo(() => computeSchedule(baseline), [baseline]);
  const cumulative = useMemo(() => baselineImpact(baseline, project), [baseline, project]);

  const preview = useMemo(() => {
    if (!review) return null;
    const changes = includedChanges(project, review);
    if (!changes.length) return null;
    return computeSchedule(applyChanges(project, changes).project);
  }, [review, project]);

  const finishShift = Math.round((schedule.finish - baseSchedule.finish) * 10) / 10;
  const previewShift = preview ? Math.round((preview.finish - schedule.finish) * 10) / 10 : 0;
  const delayed = project.tasks.filter((t) => t.delayDays > 0);
  const pushed = Object.values(cumulative.tasks).filter((t) => t.kind === "propagated").length;
  const finishDate = (s: { finish: number }) => formatShort(workdayToDate(project.startDate, Math.max(0, Math.ceil(s.finish) - 1)));

  return (
    <Card
      id="timeline"
      eyebrow="3 · Schedule"
      title={project.name}
      actions={
        <div className="flex flex-wrap items-center gap-4">
          <Switch checked={showCritical} onChange={setShowCritical} label="Critical path" />
          <Switch checked={showSlack} onChange={setShowSlack} label="Float" />
          <Switch checked={showBaseline} onChange={setShowBaseline} label="Baseline" />
        </div>
      }
    >
      <dl className="grid grid-cols-2 gap-px border-b border-ink-700 bg-ink-700 sm:grid-cols-4" data-testid="kpis">
        <Kpi label="Forecast finish" value={finishDate(schedule)} sub={finishShift > 0 ? `+${pluralDays(finishShift)} vs plan (${finishDate(baseSchedule)})` : "On plan"} tone={finishShift > 0 ? "red" : "green"} testId="kpi-finish" />
        <Kpi label="Critical path" value={`${schedule.criticalPath.length} tasks`} sub={`${schedule.finish} working days`} />
        <Kpi label="Delays logged" value={String(delayed.length)} sub={delayed.length ? `${delayed.reduce((s, t) => s + t.delayDays, 0)} task-days from the field` : "No field delays yet"} tone={delayed.length ? "red" : undefined} testId="kpi-delays" />
        <Kpi label="Knock-on" value={`${pushed} pushed`} sub={`${Object.values(cumulative.tasks).filter((t) => t.kind === "absorbed").length} absorbed by float`} tone={pushed ? "orange" : undefined} />
      </dl>

      {preview && (
        <div className="flex items-center gap-2 border-b border-amber/30 bg-amber/5 px-4 py-2 text-xs text-amber" data-testid="preview-banner">
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-dashed border-amber" aria-hidden="true" />
          Previewing the note under review —{" "}
          {previewShift > 0 ? `finish would move to ${finishDate(preview)} (+${pluralDays(previewShift)})` : "finish date unaffected (absorbed by float)"}
        </div>
      )}

      <Gantt
        project={project}
        schedule={schedule}
        baseline={baseSchedule}
        impact={impact}
        rippleSeq={rippleSeq}
        preview={preview}
        showCritical={showCritical}
        showSlack={showSlack}
        showBaseline={showBaseline}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-700 px-4 py-2.5 text-[11px] text-mute">
        <Legend swatch="bg-[#b91c1c] border-delay" label="Delayed (field report)" />
        <Legend swatch="bg-[#7c2d12] border-ripple" label="Pushed by a predecessor" />
        <Legend swatch="bg-[#3b2f0b] border-amber" label="Critical path" />
        <Legend swatch="border-dashed border-absorb/70" label="Float" thin />
        <Legend swatch="bg-mute/35" label="Planned" thin />
        <span className="ml-auto hidden text-faint sm:inline">Click a bar or use ↑ ↓ + Enter to inspect</span>
      </div>

      {selectedId && <TaskInspector taskId={selectedId} project={project} schedule={schedule} baseSchedule={baseSchedule} cumulative={cumulative} onClose={() => setSelectedId(null)} onSelect={setSelectedId} />}
    </Card>
  );
}

function Kpi({ label, value, sub, tone, testId }: { label: string; value: string; sub: string; tone?: "red" | "green" | "orange"; testId?: string }) {
  return (
    <div className="bg-ink-850 px-4 py-3" data-testid={testId}>
      <dt className="text-[10px] font-semibold tracking-wider text-faint uppercase">{label}</dt>
      <dd className={cx("mt-0.5 font-mono text-lg font-semibold tabular-nums", tone === "red" ? "text-red-300" : tone === "orange" ? "text-orange-300" : tone === "green" ? "text-emerald-300" : "text-white")}>{value}</dd>
      <dd className="text-[11px] text-mute">{sub}</dd>
    </div>
  );
}

function Legend({ swatch, label, thin }: { swatch: string; label: string; thin?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-block w-5 rounded-sm border", thin ? "h-1.5" : "h-3", swatch)} aria-hidden="true" />
      {label}
    </span>
  );
}

