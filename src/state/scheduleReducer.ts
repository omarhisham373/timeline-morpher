import { applyChanges, type RejectedChange, type ScheduleChange } from "@/domain/changes";
import { analyzeImpact, type ImpactReport } from "@/domain/impact";
import { applyRecovery, type RecoveryOption } from "@/domain/recovery";
import type { Project } from "@/domain/types";

export type ActivitySource = "mic" | "sample" | "typed" | "recovery";

export interface ActivityEntry {
  id: string;
  at: number;
  title: string;
  source: ActivitySource;
  engine?: string;
  changes: ScheduleChange[];
  rejected: RejectedChange[];
  finishShift: number;
  evidence: string[];
}

export interface ScheduleSnapshot {
  project: Project;
  activity: ActivityEntry[];
  impact: ImpactReport | null;
}

export interface ScheduleState extends ScheduleSnapshot {
  baseline: Project;
  past: ScheduleSnapshot[];
  future: ScheduleSnapshot[];
  /** Increments on every change so the timeline can replay its ripple animation. */
  rippleSeq: number;
  lastRejected: RejectedChange[];
}

export type ScheduleAction =
  | { type: "apply"; id: string; at: number; title: string; source: ActivitySource; engine?: string; changes: ScheduleChange[]; evidence: string[] }
  | { type: "recover"; id: string; at: number; option: RecoveryOption }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: Project }
  | { type: "hydrate"; baseline: Project; project: Project; activity: ActivityEntry[] };

export const HISTORY_LIMIT = 50;

export function initialScheduleState(project: Project): ScheduleState {
  return { baseline: project, project, activity: [], impact: null, past: [], future: [], rippleSeq: 0, lastRejected: [] };
}

const snapshot = (s: ScheduleState): ScheduleSnapshot => ({ project: s.project, activity: s.activity, impact: s.impact });

function commit(state: ScheduleState, next: ScheduleSnapshot, rejected: RejectedChange[] = []): ScheduleState {
  return {
    ...state,
    ...next,
    past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
    rippleSeq: state.rippleSeq + 1,
    lastRejected: rejected,
  };
}

export function scheduleReducer(state: ScheduleState, action: ScheduleAction): ScheduleState {
  switch (action.type) {
    case "apply": {
      const result = applyChanges(state.project, action.changes);
      if (!result.applied.length) return { ...state, lastRejected: result.rejected };
      const impact = analyzeImpact(state.project, result.project, result.touched);
      const entry: ActivityEntry = {
        id: action.id,
        at: action.at,
        title: action.title,
        source: action.source,
        engine: action.engine,
        changes: result.applied,
        rejected: result.rejected,
        finishShift: impact.finishShift,
        evidence: action.evidence,
      };
      return commit(state, { project: result.project, impact, activity: [entry, ...state.activity] }, result.rejected);
    }
    case "recover": {
      const project = applyRecovery(state.project, action.option);
      const impact = analyzeImpact(state.project, project, [action.option.taskId]);
      const entry: ActivityEntry = {
        id: action.id,
        at: action.at,
        title: action.option.action,
        source: "recovery",
        changes: [],
        rejected: [],
        finishShift: impact.finishShift,
        evidence: [`${action.option.fromDays} → ${action.option.toDays} days`],
      };
      return commit(state, { project, impact, activity: [entry, ...state.activity] });
    }
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return { ...state, ...prev, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future], rippleSeq: state.rippleSeq + 1, lastRejected: [] };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { ...state, ...next, past: [...state.past, snapshot(state)], future: rest, rippleSeq: state.rippleSeq + 1, lastRejected: [] };
    }
    case "reset":
      return initialScheduleState(action.project);
    case "hydrate":
      return { ...initialScheduleState(action.baseline), project: action.project, activity: action.activity };
  }
}
