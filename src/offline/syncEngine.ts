import type { ParseResponse } from "@/parsing/schema";
import { OfflineError, PermanentSyncError, type OutboxItem, type OutboxStore } from "./types";

export type TransportResult =
  | { kind: "synced"; result: ParseResponse; transcript?: string }
  | { kind: "needs_transcript" };
export type Transport = (item: OutboxItem, signal: AbortSignal) => Promise<TransportResult>;

export interface SyncEngineOptions {
  store: OutboxStore;
  transport: Transport;
  isOnline: () => boolean;
  maxAttempts?: number;
  /** Delay before attempt n+1 (n = attempts so far, ≥ 1). */
  backoff?: (attempts: number) => number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Cross-tab mutual exclusion (Web Locks in the browser). */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Items stuck in "syncing" longer than this (crash/reload mid-flight) are re-queued. */
  staleSyncMs?: number;
}

export const defaultBackoff = (attempts: number) =>
  Math.min(30_000, 1_000 * 2 ** (attempts - 1)) + Math.floor(Math.random() * 250);

type Listener = (items: OutboxItem[]) => void;

/**
 * Offline-first outbox. Captures are written to the store *first*, then synced
 * in FIFO order with exponential backoff. Offline is not an error: the item is
 * simply left queued and the engine wakes up on reconnect.
 */
export class SyncEngine {
  private readonly o: Required<Omit<SyncEngineOptions, "withLock">> & Pick<SyncEngineOptions, "withLock">;
  private draining: Promise<void> | null = null;
  private rerun = false;
  private timer: unknown = null;
  private listeners = new Set<Listener>();
  private abort = new AbortController();

  constructor(options: SyncEngineOptions) {
    this.o = {
      maxAttempts: 6,
      backoff: defaultBackoff,
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      staleSyncMs: 60_000,
      ...options,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.emit();
    return () => this.listeners.delete(listener);
  }

  async enqueue(item: Omit<OutboxItem, "status" | "attempts" | "nextAttemptAt">): Promise<OutboxItem> {
    const full: OutboxItem = { ...item, status: "queued", attempts: 0, nextAttemptAt: this.o.now() };
    await this.o.store.put(full);
    await this.emit();
    void this.drain();
    return full;
  }

  /** Manual retry (also used for "failed" items): resets the backoff. */
  async retry(id: string) {
    const item = await this.o.store.get(id);
    if (!item || item.status === "synced" || item.status === "syncing") return;
    await this.o.store.put({ ...item, status: "queued", attempts: 0, nextAttemptAt: this.o.now(), lastError: undefined });
    await this.emit();
    return this.drain();
  }

  async update(id: string, patch: Partial<OutboxItem>) {
    const item = await this.o.store.get(id);
    if (!item) return;
    await this.o.store.put({ ...item, ...patch });
    await this.emit();
  }

  async remove(id: string) {
    await this.o.store.delete(id);
    await this.emit();
  }

  /**
   * Call once on startup: anything left "syncing" by a crash or reload is
   * re-queued (under the lock, so another tab's in-flight sync is not stolen).
   */
  start() {
    const recover = () => this.recoverStale(true);
    return (this.o.withLock ? this.o.withLock(recover) : recover()).then(() => this.drain());
  }

  /** Call when connectivity comes back (browser `online` event or simulation toggle). */
  notifyOnline() {
    return this.drain();
  }

  dispose() {
    this.abort.abort();
    if (this.timer) this.o.clearTimer(this.timer);
    this.listeners.clear();
  }

  /** Single-flight: concurrent callers share one run; a call during a run schedules one more pass. */
  drain(): Promise<void> {
    if (this.draining) {
      this.rerun = true;
      return this.draining;
    }
    const run = async () => {
      do {
        this.rerun = false;
        await (this.o.withLock ? this.o.withLock(() => this.pass()) : this.pass());
      } while (this.rerun);
    };
    this.draining = run().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async pass() {
    if (this.timer) {
      this.o.clearTimer(this.timer);
      this.timer = null;
    }
    await this.recoverStale();
    if (!this.o.isOnline()) return;

    for (const item of await this.o.store.list()) {
      if (this.abort.signal.aborted) return;
      if (item.status !== "queued" || item.nextAttemptAt > this.o.now()) continue;
      if (!this.o.isOnline()) break;
      const stop = await this.syncOne(item);
      if (stop) break;
    }
    await this.scheduleNext();
  }

  /** @returns true when the run should stop (went offline). */
  private async syncOne(item: OutboxItem): Promise<boolean> {
    const syncing: OutboxItem = { ...item, status: "syncing", nextAttemptAt: this.o.now() };
    await this.o.store.put(syncing);
    await this.emit();
    try {
      const res = await this.o.transport(syncing, this.abort.signal);
      const done: OutboxItem =
        res.kind === "synced"
          ? { ...syncing, status: "synced", result: res.result, transcript: res.transcript ?? syncing.transcript, lastError: undefined, attempts: syncing.attempts + 1 }
          : { ...syncing, status: "needs_transcript", lastError: "No transcript available — type what was said to finish syncing.", attempts: syncing.attempts + 1 };
      await this.o.store.put(done);
      await this.emit();
      return false;
    } catch (err) {
      if (err instanceof OfflineError) {
        // Not the item's fault: put it back untouched and wait for `online`.
        await this.o.store.put({ ...item, status: "queued" });
        await this.emit();
        return true;
      }
      const attempts = item.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      const permanent = err instanceof PermanentSyncError;
      const exhausted = permanent || attempts >= this.o.maxAttempts;
      await this.o.store.put({
        ...item,
        attempts,
        status: exhausted ? "failed" : "queued",
        nextAttemptAt: exhausted ? Number.MAX_SAFE_INTEGER : this.o.now() + this.o.backoff(attempts),
        lastError: message,
      });
      await this.emit();
      return false;
    }
  }

  private async recoverStale(all = false) {
    const now = this.o.now();
    for (const item of await this.o.store.list()) {
      if (item.status === "syncing" && (all || now - item.nextAttemptAt > this.o.staleSyncMs)) {
        await this.o.store.put({ ...item, status: "queued", nextAttemptAt: now });
      }
    }
  }

  private async scheduleNext() {
    const pending = (await this.o.store.list()).filter((i) => i.status === "queued");
    if (!pending.length || !this.o.isOnline()) return;
    const next = Math.min(...pending.map((i) => i.nextAttemptAt));
    const wait = Math.max(0, next - this.o.now());
    this.timer = this.o.setTimer(() => {
      this.timer = null;
      void this.drain();
    }, wait);
  }

  private async emit() {
    if (!this.listeners.size) return;
    const items = await this.o.store.list();
    this.listeners.forEach((l) => l(items));
  }
}
