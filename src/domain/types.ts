/**
 * Core schedule domain. Everything in `src/domain` is pure TypeScript with no
 * React / browser dependencies so it can be unit-tested and reused server-side.
 *
 * Time is modelled in **working days** from the project start (day 0). Converting
 * to calendar dates (skipping weekends) is the job of `calendar.ts`.
 */

export type TaskId = string;

/** Finish-to-start link: `taskId` may start `lagDays` after the predecessor finishes. */
export interface Dependency {
  taskId: TaskId;
  lagDays: number;
}

export interface Task {
  id: TaskId;
  name: string;
  trade: string;
  /** Extra words a superintendent might use for this task ("pour", "sparky"). */
  aliases: string[];
  /** Planned working-day duration (> 0). */
  durationDays: number;
  /** Predecessors (finish-to-start). */
  dependsOn: Dependency[];
  /** Accumulated delay reported from the field (working days, may be fractional). */
  delayDays: number;
}

export interface Project {
  id: string;
  name: string;
  /** ISO date (YYYY-MM-DD) of working day 0. */
  startDate: string;
  tasks: Task[];
}

/** Output of the critical-path method for one task. */
export interface ScheduledTask {
  id: TaskId;
  /** Early start / finish (working days from project start). */
  es: number;
  ef: number;
  /** Late start / finish. */
  ls: number;
  lf: number;
  /** Total float: how far this task can slip without moving project finish. */
  slack: number;
  critical: boolean;
  /** Predecessor that determines `es` (null for tasks with no predecessors). */
  drivingPredecessor: TaskId | null;
}

export interface Schedule {
  tasks: Record<TaskId, ScheduledTask>;
  /** Topological order (stable with respect to project.tasks order). */
  order: TaskId[];
  finish: number;
  criticalPath: TaskId[];
}
