import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import { clearSchedule, loadSchedule, saveSchedule } from "./persistence";
import { initialScheduleState, scheduleReducer, type ScheduleAction, type ScheduleState } from "./scheduleReducer";

/**
 * Schedule state lives outside React (read with useSyncExternalStore) so it can
 * be hydrated from localStorage without a render/effect dance, and so non-React
 * code — the sync transport — can read the current project.
 */
export interface ScheduleStore {
  getState: () => ScheduleState;
  getServerState: () => ScheduleState;
  dispatch: (action: ScheduleAction) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createScheduleStore(options: { persist?: boolean } = {}): ScheduleStore {
  const serverState = initialScheduleState(SAMPLE_PROJECT);
  let state: ScheduleState | null = null;
  const listeners = new Set<() => void>();

  const getState = () => {
    if (!state) {
      state = serverState;
      if (options.persist && typeof window !== "undefined") {
        const saved = loadSchedule(SAMPLE_PROJECT.id);
        if (saved) state = scheduleReducer(state, { type: "hydrate", ...saved });
      }
    }
    return state;
  };

  return {
    getState,
    getServerState: () => serverState,
    dispatch(action) {
      const prev = getState();
      const next = scheduleReducer(prev, action);
      if (next === prev) return;
      state = next;
      if (options.persist) {
        if (action.type === "reset") clearSchedule();
        else saveSchedule({ baseline: next.baseline, project: next.project, activity: next.activity });
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
