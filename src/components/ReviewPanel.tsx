"use client";

import { useMemo, useState } from "react";
import { formatShort, pluralDays, workdayToDate } from "@/domain/calendar";
import { applyChanges } from "@/domain/changes";
import { analyzeImpact } from "@/domain/impact";
import type { Project, TaskId } from "@/domain/types";
import { validateAgainstSchedule, type ParsedItem, type ParseNote } from "@/parsing/schema";
import { useApp } from "@/state/AppProvider";
import { includedChanges, itemProblem, type DraftItem, type ReviewDraft } from "@/state/review";
import { Badge, Button, Card, ConfidenceMeter, cx } from "./ui/primitives";

const NOTE_TONE: Record<ParseNote["kind"], { tone: "green" | "orange" | "red" | "amber"; label: string }> = {
  on_track: { tone: "green", label: "On track" },
  consequence: { tone: "orange", label: "Knock-on · handled by dependencies" },
  unmatched: { tone: "red", label: "Needs a human" },
  ambiguous: { tone: "amber", label: "Ambiguous" },
};

export function ReviewPanel() {
  const { review, updateReview, applyReview, discardReview, schedule } = useApp();
  const [tab, setTab] = useState<"changes" | "json">("changes");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  if (!review) return null;
  const project = schedule.project;
  const applicable = includedChanges(project, review).length;
  const res = review.response;

  return (
    <Card
      id="review"
      eyebrow="Review before it touches the schedule"
      title={<span data-testid="review-summary">{res.result.summary}</span>}
      className="border-amber/40 shadow-[0_0_0_1px_rgb(250_202_56/0.15),0_20px_60px_-30px_rgb(250_202_56/0.4)]"
      actions={
        <>
          <Badge tone={res.engine === "llm" ? "blue" : "neutral"}>{res.engine === "llm" ? res.model : "Local parser"}</Badge>
          {res.fallbackReason && <Badge tone="amber">LLM fallback</Badge>}
          <Badge>{res.latencyMs} ms</Badge>
        </>
      }
    >
      <div role="tablist" aria-label="Review mode" className="flex gap-1 border-b border-ink-700 px-4 pt-2">
        {(["changes", "json"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
            className={cx("focus-ring -mb-px border-b-2 px-3 py-2 text-xs font-medium", tab === t ? "border-amber text-white" : "border-transparent text-mute hover:text-white")}
          >
            {t === "changes" ? `Proposed changes (${review.items.length})` : "Validated JSON"}
          </button>
        ))}
      </div>

      {res.fallbackReason && <p className="border-b border-ink-700 px-4 py-2 text-[11px] text-amber">LLM unavailable ({res.fallbackReason}) — parsed with the deterministic on-device engine instead.</p>}

      {tab === "changes" ? (
        <div className="space-y-4 p-4">
          <HighlightedTranscript text={review.transcript} highlight={review.items.find((i) => i.key === hoverKey)?.item.evidence} evidence={review.items.map((i) => i.item.evidence)} />
          {review.items.length === 0 && <p className="text-xs text-mute">No schedule changes found. Add one manually if the parser missed something.</p>}
          <ul className="space-y-2" data-testid="review-items">
            {review.items.map((d) => (
              <ItemRow key={d.key} draft={d} project={project} onHover={setHoverKey} onChange={(next) => updateReview((r) => ({ ...r, items: r.items.map((x) => (x.key === d.key ? next : x)) }))} onRemove={() => updateReview((r) => ({ ...r, items: r.items.filter((x) => x.key !== d.key) }))} />
            ))}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => updateReview((r) => ({ ...r, items: [...r.items, manualItem(r, project)] }))}>
            + Add a change the parser missed
          </Button>

          {review.notes.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">Also heard</p>
              <ul className="space-y-1.5" data-testid="review-notes">
                {review.notes.map((n, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <Badge tone={NOTE_TONE[n.kind].tone}>{NOTE_TONE[n.kind].label}</Badge>
                    <span className="text-mute">“{n.text}”</span>
                    {n.detail && <span className="text-faint">— {n.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ImpactDiff project={project} draft={review} />
        </div>
      ) : (
        <JsonEditor draft={review} project={project} onValid={(items, notes, summary) => updateReview((r) => ({ ...r, items, notes, response: { ...r.response, result: { ...r.response.result, summary } } }))} />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 px-4 py-3">
        <p className="text-[11px] text-faint">Nothing changes until you apply. Every apply is undoable.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={discardReview} data-testid="discard-review">
            Discard
          </Button>
          <Button variant="primary" onClick={applyReview} disabled={!applicable} data-testid="apply-review">
            Apply {applicable} change{applicable === 1 ? "" : "s"} to schedule
          </Button>
        </div>
      </footer>
    </Card>
  );
}

function ItemRow({ draft, project, onChange, onRemove, onHover }: { draft: DraftItem; project: Project; onChange: (d: DraftItem) => void; onRemove: () => void; onHover: (k: string | null) => void }) {
  const { item } = draft;
  const problem = itemProblem(project, item);
  const set = (patch: Partial<ParsedItem>) => onChange({ ...draft, item: { ...item, ...patch } as ParsedItem });
  const taskOptions = project.tasks.map((t) => (
    <option key={t.id} value={t.id}>
      {t.name}
    </option>
  ));
  const field = "focus-ring h-8 rounded-lg border border-ink-600 bg-ink-950 px-2 text-xs text-white";

  return (
    <li
      className={cx("rounded-xl border p-3 transition-colors", problem ? "border-ink-600 opacity-70" : draft.include ? (item.type === "delay" ? "border-delay/40 bg-delay/5" : "border-sky-500/30 bg-sky-500/5") : "border-ink-600")}
      onMouseEnter={() => onHover(draft.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(draft.key)}
      data-testid="review-item"
      data-type={item.type}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={draft.include && !problem} disabled={!!problem} onChange={(e) => onChange({ ...draft, include: e.target.checked })} aria-label="Include this change" className="h-4 w-4 accent-[#faca38]" />
        <Badge tone={item.type === "delay" ? "red" : "blue"}>{item.type === "delay" ? "Delay" : "Dependency"}</Badge>
        {item.type === "delay" ? (
          <>
            <select className={field} value={item.taskId} onChange={(e) => set({ taskId: e.target.value })} aria-label="Delayed task">
              {taskOptions}
            </select>
            <label className="flex items-center gap-1 text-xs text-mute">
              +
              <input type="number" min={0.5} max={60} step={0.5} value={item.delayDays} onChange={(e) => set({ delayDays: Number(e.target.value), assumedDuration: false })} className={cx(field, "w-16 font-mono")} aria-label="Delay in working days" data-testid="delay-days" />
              days
            </label>
            {item.category !== "other" && <Badge>{item.category}</Badge>}
            {item.assumedDuration && <Badge tone="amber">duration assumed — confirm</Badge>}
          </>
        ) : (
          <>
            <select className={field} value={item.taskId} onChange={(e) => set({ taskId: e.target.value })} aria-label="Task that waits">
              {taskOptions}
            </select>
            <span className="text-xs text-mute">waits on</span>
            <select className={field} value={item.dependsOnTaskId} onChange={(e) => set({ dependsOnTaskId: e.target.value })} aria-label="Predecessor">
              {taskOptions}
            </select>
            <label className="flex items-center gap-1 text-xs text-mute">
              lag
              <input type="number" min={0} max={60} step={0.5} value={item.lagDays} onChange={(e) => set({ lagDays: Number(e.target.value) })} className={cx(field, "w-14 font-mono")} aria-label="Lag in working days" />
            </label>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ConfidenceMeter value={item.confidence} />
          <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove change">
            ✕
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-faint">
        “{item.evidence}”{item.reason && item.reason !== item.evidence && <span className="text-mute"> · {item.reason}</span>}
      </p>
      {problem && (
        <p className="mt-1 text-xs text-amber" role="note">
          Can&apos;t apply: {problem}
        </p>
      )}
    </li>
  );
}

function HighlightedTranscript({ text, highlight, evidence }: { text: string; highlight?: string; evidence: string[] }) {
  const parts = useMemo(() => {
    const spans: { start: number; end: number; active: boolean }[] = [];
    for (const e of evidence) {
      const i = text.indexOf(e);
      if (i >= 0) spans.push({ start: i, end: i + e.length, active: e === highlight });
    }
    spans.sort((a, b) => a.start - b.start);
    const out: { t: string; mark?: boolean; active?: boolean }[] = [];
    let cursor = 0;
    for (const s of spans) {
      if (s.start < cursor) continue;
      out.push({ t: text.slice(cursor, s.start) });
      out.push({ t: text.slice(s.start, s.end), mark: true, active: s.active });
      cursor = s.end;
    }
    out.push({ t: text.slice(cursor) });
    return out;
  }, [text, highlight, evidence]);
  return (
    <blockquote className="rounded-xl border border-ink-600 bg-ink-950 p-3 text-sm leading-relaxed text-mute" aria-label="Transcript with evidence highlighted">
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className={cx("rounded px-0.5 transition-colors", p.active ? "bg-amber text-ink-950" : "bg-amber/15 text-white")}>
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </blockquote>
  );
}

function ImpactDiff({ project, draft }: { project: Project; draft: ReviewDraft }) {
  const diff = useMemo(() => {
    const changes = includedChanges(project, draft);
    if (!changes.length) return null;
    const result = applyChanges(project, changes);
    return analyzeImpact(project, result.project, result.touched);
  }, [project, draft]);
  if (!diff) return null;
  const rows = diff.after.order.map((id) => diff.tasks[id]).filter((t) => t.kind !== "unchanged");
  const name = (id: TaskId) => project.tasks.find((t) => t.id === id)?.name ?? id;
  const date = (o: number) => formatShort(workdayToDate(project.startDate, o));
  const end = (ef: number, es: number) => date(Math.max(es, Math.ceil(ef) - 1));
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase">Schedule diff if applied</p>
      <div className="overflow-x-auto rounded-xl border border-ink-600">
        <table className="w-full text-left text-xs" data-testid="impact-diff">
          <thead className="bg-ink-800 text-faint">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Finish</th>
              <th className="px-3 py-2 font-medium">Shift</th>
              <th className="px-3 py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-700">
            {rows.map((r) => {
              const b = diff.before.tasks[r.id];
              const a = diff.after.tasks[r.id];
              return (
                <tr key={r.id}>
                  <td className="px-3 py-1.5 text-white">{name(r.id)}</td>
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap text-mute">
                    <span className="line-through decoration-faint">{end(b.ef, b.es)}</span> → <span className="text-white">{end(a.ef, a.es)}</span>
                  </td>
                  <td className={cx("px-3 py-1.5 font-mono", r.finishShift > 0 ? "text-red-300" : "text-emerald-300")}>{r.finishShift > 0 ? `+${r.finishShift}d` : "0"}</td>
                  <td className="px-3 py-1.5 text-mute">{r.kind === "direct" ? "Reported" : r.kind === "absorbed" ? `Float absorbed ${pluralDays(r.slackLost)}` : `via ${r.causeChain.slice(0, -1).map(name).join(" → ")}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-xs" data-testid="impact-finish">
        {diff.finishShift > 0 ? <span className="text-red-300">Project finish moves +{pluralDays(diff.finishShift)}.</span> : <span className="text-emerald-300">Project finish unaffected.</span>}
      </p>
    </div>
  );
}

function JsonEditor({ draft, project, onValid }: { draft: ReviewDraft; project: Project; onValid: (items: DraftItem[], notes: ParseNote[], summary: string) => void }) {
  const initial = useMemo(
    () => JSON.stringify({ summary: draft.response.result.summary, items: draft.items.filter((d) => d.include).map((d) => d.item), notes: draft.notes }, null, 2),
    // Only on open: further edits are owned by the textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.id],
  );
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; message: string }>({ ok: true, message: "Valid against ParsedFieldNoteSchema (zod)" });

  const onChange = (value: string) => {
    setText(value);
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch (e) {
      setStatus({ ok: false, message: `JSON syntax: ${(e as Error).message}` });
      return;
    }
    const checked = validateAgainstSchedule(json, new Set(project.tasks.map((t) => t.id)));
    if (!checked.ok) {
      setStatus({ ok: false, message: checked.error });
      return;
    }
    setStatus({ ok: true, message: `Valid · ${checked.value.items.length} item(s)${checked.value.notes.length ? `, ${checked.value.notes.length} note(s)` : ""}` });
    onValid(
      checked.value.items.map((item, i) => ({ key: `${draft.id}-json-${i}`, include: true, item })),
      checked.value.notes,
      checked.value.summary,
    );
  };

  return (
    <div className="space-y-2 p-4">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={16}
        aria-label="Parsed payload as JSON"
        aria-invalid={!status.ok}
        data-testid="json-editor"
        className={cx("focus-ring w-full rounded-xl border bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-white", status.ok ? "border-ink-600" : "border-delay")}
      />
      <p className={cx("text-xs", status.ok ? "text-emerald-300" : "text-red-300")} role="status" data-testid="json-status">
        {status.ok ? "✓ " : "✕ "}
        {status.message}
      </p>
    </div>
  );
}

function manualItem(r: ReviewDraft, project: Project): DraftItem {
  return {
    key: `${r.id}-manual-${r.items.length}-${Date.now()}`,
    include: true,
    item: { type: "delay", taskId: project.tasks[0].id, delayDays: 1, reason: "Added by reviewer", category: "other", confidence: 1, evidence: "Added manually by reviewer", assumedDuration: false },
  };
}
