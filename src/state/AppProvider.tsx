"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { RecoveryOption } from "@/domain/recovery";
import { SERVER_NETWORK_SNAPSHOT } from "@/offline/network";
import type { CaptureSource, OutboxItem } from "@/offline/types";
import { createDraft, includedChanges, type ReviewDraft } from "./review";
import { getRuntime } from "./runtime";
import type { ScheduleAction, ScheduleState } from "./scheduleReducer";
import { createScheduleStore } from "./scheduleStore";

export interface EngineConfig {
  llm: { provider: string; model: string } | null;
  stt: { provider: string; model: string } | null;
}

interface AppContextValue {
  schedule: ScheduleState;
  dispatch: (a: ScheduleAction) => void;
  online: boolean;
  simulatedOffline: boolean;
  flaky: boolean;
  setSimulatedOffline: (v: boolean) => void;
  setFlaky: (v: boolean) => void;
  outbox: OutboxItem[];
  storageKind: "indexeddb" | "memory" | null;
  capture: (c: { source: CaptureSource; transcript: string; audio?: Blob; durationMs?: number }) => Promise<OutboxItem>;
  retryItem: (id: string) => void;
  removeItem: (id: string) => void;
  completeTranscript: (id: string, transcript: string) => void;
  review: ReviewDraft | null;
  openReview: (item: OutboxItem) => void;
  updateReview: (fn: (d: ReviewDraft) => ReviewDraft) => void;
  applyReview: () => void;
  discardReview: () => void;
  applyRecoveryOption: (o: RecoveryOption) => void;
  resetDemo: () => void;
  engineConfig: EngineConfig | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const scheduleStore = createScheduleStore({ persist: true });
const runtime = () => getRuntime(() => scheduleStore.getState().project);
const subscribeNet = (cb: () => void) => runtime().net.subscribe(cb);
const getNetSnapshot = () => runtime().net.getSnapshot();
const getServerNetSnapshot = () => SERVER_NETWORK_SNAPSHOT;

const draftFromItem = (item: OutboxItem) => createDraft(uid(), item.transcript, item.source, item.result!, item.id);
const nextUnreviewed = (items: OutboxItem[]) => items.find((i) => i.status === "synced" && !i.reviewed && i.result);

export function AppProvider({ children }: { children: ReactNode }) {
  const schedule = useSyncExternalStore(scheduleStore.subscribe, scheduleStore.getState, scheduleStore.getServerState);
  const net = useSyncExternalStore(subscribeNet, getNetSnapshot, getServerNetSnapshot);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [storageKind, setStorageKind] = useState<"indexeddb" | "memory" | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [engineConfig, setEngineConfig] = useState<EngineConfig | null>(null);

  // Wire the outbox: reflect items, auto-open the next synced note for review,
  // and drain the queue whenever connectivity returns.
  useEffect(() => {
    const rt = runtime();
    const unsubOutbox = rt.engine.subscribe((items) => {
      setStorageKind(rt.storageKind);
      setOutbox(items);
      const next = nextUnreviewed(items);
      if (next) setReview((current) => current ?? draftFromItem(next));
    });
    const unsubNet = rt.net.subscribe((online) => {
      if (online) void rt.engine.notifyOnline();
    });
    void rt.engine.start();
    return () => {
      unsubOutbox();
      unsubNet();
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/config", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { llm: null, stt: null }))
      .then(setEngineConfig)
      .catch(() => setEngineConfig({ llm: null, stt: null }));
    return () => ctrl.abort();
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const { engine, net: monitor } = runtimeOrNull() ?? {};
    const closeReview = async (draft: ReviewDraft) => {
      // Mark first so the auto-open logic doesn't reopen it, then move on to the
      // next synced note (e.g. several notes captured offline).
      if (draft.outboxId) await engine?.update(draft.outboxId, { reviewed: true });
      const next = engine ? nextUnreviewed(await engine.list()) : undefined;
      setReview((current) => (current?.id === draft.id ? (next ? draftFromItem(next) : null) : current));
    };
    return {
      schedule,
      dispatch: scheduleStore.dispatch,
      online: net.online,
      simulatedOffline: net.simulatedOffline,
      flaky: net.flaky,
      setSimulatedOffline: (v) => monitor?.setSimulatedOffline(v),
      setFlaky: (v) => monitor?.setFlaky(v),
      outbox,
      storageKind,
      capture: (c) => runtime().engine.enqueue({ id: uid(), createdAt: Date.now(), audioType: c.audio?.type, ...c }),
      retryItem: (id) => void engine?.retry(id),
      removeItem: (id) => void engine?.remove(id),
      completeTranscript: (id, transcript) =>
        void engine?.update(id, { transcript, status: "queued", attempts: 0, nextAttemptAt: Date.now(), lastError: undefined }).then(() => engine.drain()),
      review,
      openReview: (item) => item.result && setReview(draftFromItem(item)),
      updateReview: (fn) => setReview((d) => (d ? fn(d) : d)),
      applyReview: () => {
        if (!review) return;
        const changes = includedChanges(schedule.project, review);
        if (changes.length) {
          scheduleStore.dispatch({
            type: "apply",
            id: uid(),
            at: Date.now(),
            title: review.response.result.summary || "Field note applied",
            source: review.source,
            engine: review.response.engine === "llm" ? review.response.model : "local parser",
            changes,
            evidence: review.items.filter((d) => d.include).map((d) => d.item.evidence),
          });
        }
        void closeReview(review);
      },
      discardReview: () => review && void closeReview(review),
      applyRecoveryOption: (option) => scheduleStore.dispatch({ type: "recover", id: uid(), at: Date.now(), option }),
      resetDemo: () => {
        scheduleStore.dispatch({ type: "reset", project: scheduleStore.getServerState().baseline });
        setReview(null);
      },
      engineConfig,
    };
  }, [schedule, net, outbox, storageKind, review, engineConfig]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** The runtime only exists in the browser; during SSR the handlers are inert. */
function runtimeOrNull() {
  return typeof window === "undefined" ? null : runtime();
}
