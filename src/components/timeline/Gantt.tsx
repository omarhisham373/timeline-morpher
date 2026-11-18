"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { formatShort, formatWeekday, pluralDays, workdayToDate } from "@/domain/calendar";
import type { ImpactReport } from "@/domain/impact";
import type { Project, Schedule, TaskId } from "@/domain/types";
import { cx } from "../ui/primitives";
import { barStatus } from "./model";

const ROW_H = 44;
const AXIS_H = 40;

export interface GanttProps {
  project: Project;
  schedule: Schedule;
  baseline: Schedule;
  /** Impact of the most recent change (drives the ripple animation). */
  impact: ImpactReport | null;
  rippleSeq: number;
  /** What-if preview while a parsed note is under review. */
  preview: Schedule | null;
  showCritical: boolean;
  showSlack: boolean;
  showBaseline: boolean;
  selectedId: TaskId | null;
  onSelect: (id: TaskId | null) => void;
}

export function Gantt(props: GanttProps) {
  const { project, schedule, baseline, impact, rippleSeq, preview, showCritical, showSlack, showBaseline, selectedId, onSelect } = props;
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const rowRefs = useRef(new Map<TaskId, HTMLButtonElement>());
  const [focusState, setFocusId] = useState<TaskId>(project.tasks[0].id);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelW = width < 640 ? 118 : 176;
  const totalDays = Math.ceil(Math.max(schedule.finish, baseline.finish, preview?.finish ?? 0)) + 2;
  // Fit the whole job on screen when possible; scroll horizontally on small screens.
  const dw = Math.max(width < 640 ? 24 : 16, Math.floor((width - labelW - 8) / totalDays));
  const trackW = totalDays * dw;
  const rows = useMemo(() => project.tasks.map((t) => t.id), [project.tasks]);
  const rowIndex = useMemo(() => new Map(rows.map((id, i) => [id, i])), [rows]);
  const criticalSet = useMemo(() => new Set(schedule.criticalPath), [schedule.criticalPath]);

  const days = useMemo(() => Array.from({ length: totalDays }, (_, i) => workdayToDate(project.startDate, i)), [project.startDate, totalDays]);

  // Keyboard navigation across rows (roving tabindex).
  const focusId = rows.includes(focusState) ? focusState : rows[0];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = rows.indexOf(focusId);
    let next = idx;
    if (e.key === "ArrowDown") next = Math.min(rows.length - 1, idx + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, idx - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "Escape") {
      onSelect(null);
      return;
    } else return;
    e.preventDefault();
    setFocusId(rows[next]);
    rowRefs.current.get(rows[next])?.focus();
  };

  const ripple = (id: TaskId) => {
    const t = impact?.tasks[id];
    if (!t || t.kind === "unchanged") return null;
    return t;
  };
  // After a change lands, bring the first affected bar into view — on a phone
  // the timeline scrolls horizontally and the ripple could start off-screen.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!rippleSeq || !impact || !el || el.scrollWidth <= el.clientWidth) return;
    const firstHit = Object.entries(impact.tasks)
      .filter(([, t]) => t.kind === "direct" || t.kind === "propagated")
      .map(([id]) => schedule.tasks[id]?.es ?? Infinity)
      .reduce((a, b) => Math.min(a, b), Infinity);
    if (Number.isFinite(firstHit)) el.scrollTo({ left: Math.max(0, firstHit * dw - dw * 2), behavior: reduceMotion ? "auto" : "smooth" });
    // Only on a new ripple, not on every resize.
  }, [rippleSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const stagger = (id: TaskId) => (reduceMotion ? 0 : (ripple(id)?.depth ?? 0) * 0.14);

  return (
    <div ref={wrapRef} className="w-full">
      <div ref={scrollRef} className="scroll-thin overflow-x-auto" onKeyDown={onKeyDown}>
        <div className="relative" style={{ width: labelW + trackW, minWidth: "100%" }}>
          {/* Axis */}
          <div className="sticky top-0 z-20 flex border-b border-ink-600 bg-ink-850" style={{ height: AXIS_H }}>
            <div className="sticky left-0 z-10 flex items-end bg-ink-850 px-3 pb-1.5 text-[10px] font-semibold tracking-wider text-faint uppercase" style={{ width: labelW, minWidth: labelW }}>
              Task
            </div>
            <div className="relative" style={{ width: trackW }}>
              {days.map((d, i) => {
                const monday = d.getUTCDay() === 1;
                return (
                  <div key={i} className={cx("absolute top-0 bottom-0 border-l text-center", monday ? "border-ink-500" : "border-ink-700")} style={{ left: i * dw, width: dw }}>
                    {(dw >= 30 || monday || i === 0) && (
                      <>
                        <span className="block pt-1 text-[9px] text-faint uppercase">{monday || i === 0 ? formatShort(d).split(" ")[0] : formatWeekday(d).slice(0, 2)}</span>
                        <span className={cx("block font-mono text-[11px] tabular-nums", monday ? "text-white" : "text-mute")}>{d.getUTCDate()}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rows */}
          <div className="relative" role="list" aria-label="Schedule tasks">
            {/* grid + finish lines */}
            <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: labelW, width: trackW }} aria-hidden="true">
              {days.map((d, i) => (
                <div key={i} className={cx("absolute top-0 bottom-0 border-l", d.getUTCDay() === 1 ? "border-ink-600" : "border-ink-700/50")} style={{ left: i * dw }} />
              ))}
              {showBaseline && baseline.finish !== schedule.finish && (
                <div className="absolute top-0 bottom-0 border-l border-dashed border-mute/60" style={{ left: baseline.finish * dw }}>
                  <span className="absolute right-1 bottom-1 rounded bg-ink-700 px-1 text-[9px] whitespace-nowrap text-mute">planned</span>
                </div>
              )}
              <motion.div className="absolute top-0 bottom-0 z-10 border-l-2 border-amber" initial={false} animate={{ left: schedule.finish * dw }} transition={{ type: "spring", stiffness: 120, damping: 20, delay: reduceMotion ? 0 : 0.5 }}>
                <span className="absolute top-1 right-1 rounded bg-amber px-1 text-[9px] font-semibold whitespace-nowrap text-ink-950 shadow" data-testid="finish-marker">
                  finish {formatShort(workdayToDate(project.startDate, Math.max(0, Math.ceil(schedule.finish) - 1)))}
                </span>
              </motion.div>
            </div>

            <DependencyArrows project={project} schedule={schedule} rowIndex={rowIndex} dw={dw} labelW={labelW} trackW={trackW} criticalSet={showCritical ? criticalSet : new Set()} impact={impact} reduceMotion={!!reduceMotion} />

            {project.tasks.map((task) => {
              const s = schedule.tasks[task.id];
              const b = baseline.tasks[task.id];
              const p = preview?.tasks[task.id];
              const status = barStatus(project, schedule, baseline, task.id);
              const critical = showCritical && criticalSet.has(task.id);
              const hit = ripple(task.id);
              const selected = selectedId === task.id;
              const startDate = workdayToDate(project.startDate, s.es);
              const endDate = workdayToDate(project.startDate, Math.max(s.es, Math.ceil(s.ef) - 1));
              const shift = Math.round((s.ef - (b?.ef ?? s.ef)) * 10) / 10;
              const label = `${task.name}, ${task.trade}. ${formatShort(startDate)} to ${formatShort(endDate)}.${task.delayDays > 0 ? ` Delayed ${pluralDays(task.delayDays)}.` : ""}${shift > 0 ? ` Finish ${pluralDays(shift)} late.` : ""}${criticalSet.has(task.id) ? " Critical path." : ` ${pluralDays(s.slack)} of float.`}`;

              return (
                <div key={task.id} role="listitem" className={cx("relative flex border-b border-ink-700/70", selected && "bg-amber/5")} style={{ height: ROW_H }}>
                  {/* Label */}
                  <div className="sticky left-0 z-10 flex flex-col justify-center border-r border-ink-700 bg-ink-850/95 px-3 backdrop-blur" style={{ width: labelW, minWidth: labelW }}>
                    <span className={cx("truncate text-xs font-medium", status === "on-plan" ? "text-white" : "text-red-200")}>{task.name}</span>
                    <span className="truncate text-[10px] text-faint">
                      {task.trade}
                      {shift > 0 && <span className="ml-1 font-mono text-red-300">+{shift}d</span>}
                    </span>
                  </div>

                  {/* Track */}
                  <div className="relative" style={{ width: trackW }}>
                    {showBaseline && b && (b.es !== s.es || b.ef !== s.ef) && (
                      <div className="absolute top-[30px] h-1 rounded-full bg-mute/35" style={{ left: b.es * dw + 2, width: Math.max(4, (b.ef - b.es) * dw - 4) }} title="Planned position" aria-hidden="true" />
                    )}
                    {showSlack && s.slack > 0 && (
                      <motion.div
                        className="absolute top-[21px] h-0 border-t border-dashed border-absorb/60"
                        initial={false}
                        animate={{ left: s.ef * dw, width: s.slack * dw }}
                        transition={{ type: "spring", stiffness: 140, damping: 22, delay: stagger(task.id) }}
                        aria-hidden="true"
                      >
                        {s.slack * dw > 34 && <span className="absolute -top-3.5 right-0 text-[9px] text-emerald-300/80">{s.slack}d float</span>}
                      </motion.div>
                    )}
                    {p && (p.es !== s.es || p.ef !== s.ef) && (
                      <div
                        className="absolute top-[7px] h-[30px] rounded-md border-2 border-dashed border-amber/80 bg-amber/5"
                        style={{ left: p.es * dw + 2, width: Math.max(8, (p.ef - p.es) * dw - 4) }}
                        data-testid={`preview-${task.id}`}
                        aria-hidden="true"
                      />
                    )}
                    <motion.button
                      type="button"
                      ref={(el) => {
                        if (el) rowRefs.current.set(task.id, el);
                        else rowRefs.current.delete(task.id);
                      }}
                      tabIndex={focusId === task.id ? 0 : -1}
                      onFocus={() => setFocusId(task.id)}
                      onClick={() => onSelect(selected ? null : task.id)}
                      aria-pressed={selected}
                      aria-label={label}
                      data-testid={`bar-${task.id}`}
                      data-status={status}
                      data-critical={criticalSet.has(task.id) ? "true" : "false"}
                      initial={false}
                      animate={{
                        left: s.es * dw + 2,
                        width: Math.max(10, (s.ef - s.es) * dw - 4),
                        backgroundColor: status === "delayed" ? "#b91c1c" : status === "pushed" ? "#7c2d12" : critical ? "#3b2f0b" : "#2a2a2a",
                        borderColor: status === "delayed" ? "#ef4444" : status === "pushed" ? "#fb7a3c" : critical ? "#faca38" : "#474747",
                      }}
                      transition={{ type: "spring", stiffness: 170, damping: 22, delay: stagger(task.id), backgroundColor: { duration: 0.35, delay: stagger(task.id) }, borderColor: { duration: 0.35, delay: stagger(task.id) } }}
                      className={cx(
                        "focus-ring absolute top-[7px] flex h-[30px] items-center overflow-hidden rounded-md border text-left",
                        selected && "ring-2 ring-white/80",
                        critical && status !== "on-plan" && "shadow-[0_0_0_1px_#faca38]",
                      )}
                    >
                      {task.delayDays > 0 && (
                        <motion.span
                          className="hatch-delay absolute top-0 bottom-0 left-0 flex items-center justify-center"
                          initial={false}
                          animate={{ width: Math.min(task.delayDays * dw, (s.ef - s.es) * dw - 4) }}
                          transition={{ duration: 0.45, delay: stagger(task.id) }}
                          aria-hidden="true"
                        >
                          {task.delayDays * dw >= 26 && <span className="rounded bg-black/50 px-1 font-mono text-[10px] font-bold text-white">+{task.delayDays}d</span>}
                        </motion.span>
                      )}
                      <span className="relative ml-auto truncate px-2 font-mono text-[10px] text-white/80 tabular-nums">{(s.ef - s.es) * dw > 60 ? `${s.ef - s.es}d` : ""}</span>
                    </motion.button>

                    {hit && !reduceMotion && (
                      <span
                        key={`${rippleSeq}-${task.id}`}
                        className={cx("ripple-ring pointer-events-none absolute top-[7px] h-[30px] rounded-md border-2", hit.kind === "absorbed" ? "border-absorb" : hit.kind === "direct" ? "border-delay" : "border-ripple")}
                        style={{ left: s.es * dw + 2, width: Math.max(10, (s.ef - s.es) * dw - 4), animationDelay: `${stagger(task.id) + 0.25}s` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DependencyArrows({
  project,
  schedule,
  rowIndex,
  dw,
  labelW,
  trackW,
  criticalSet,
  impact,
  reduceMotion,
}: {
  project: Project;
  schedule: Schedule;
  rowIndex: Map<TaskId, number>;
  dw: number;
  labelW: number;
  trackW: number;
  criticalSet: Set<TaskId>;
  impact: ImpactReport | null;
  reduceMotion: boolean;
}) {
  const height = project.tasks.length * ROW_H;
  const edges = project.tasks.flatMap((t) =>
    t.dependsOn.map((d) => {
      const from = schedule.tasks[d.taskId];
      const to = schedule.tasks[t.id];
      const x1 = from.ef * dw - 2;
      const y1 = rowIndex.get(d.taskId)! * ROW_H + ROW_H / 2;
      const x2 = to.es * dw + 2;
      const y2 = rowIndex.get(t.id)! * ROW_H + ROW_H / 2;
      const down = y2 > y1 ? 1 : -1;
      const path =
        x2 - x1 >= 14
          ? `M ${x1} ${y1} H ${x1 + 7} V ${y2} H ${x2 - 1}`
          : `M ${x1} ${y1} H ${x1 + 7} V ${y1 + down * (ROW_H / 2)} H ${x2 - 9} V ${y2} H ${x2 - 1}`;
      const driving = to.drivingPredecessor === d.taskId;
      const hot = driving && impact && ["propagated", "direct"].includes(impact.tasks[t.id]?.kind ?? "") && impact.tasks[t.id]?.finishShift > 0;
      const critical = driving && criticalSet.has(d.taskId) && criticalSet.has(t.id);
      return { key: `${d.taskId}->${t.id}`, path, hot, critical };
    }),
  );
  return (
    <svg className="pointer-events-none absolute top-0" style={{ left: labelW, width: trackW, height }} width={trackW} height={height} aria-hidden="true">
      <defs>
        {["#5a5a5a", "#faca38", "#ef4444"].map((c) => (
          <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill={c} />
          </marker>
        ))}
      </defs>
      {edges.map((e) => {
        const color = e.hot ? "#ef4444" : e.critical ? "#faca38" : "#5a5a5a";
        return (
          <motion.path
            key={e.key}
            initial={false}
            animate={{ d: e.path }}
            transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeInOut" }}
            fill="none"
            stroke={color}
            strokeWidth={e.hot || e.critical ? 1.6 : 1}
            strokeOpacity={e.hot || e.critical ? 0.95 : 0.7}
            markerEnd={`url(#arrow-${color.slice(1)})`}
          />
        );
      })}
    </svg>
  );
}
