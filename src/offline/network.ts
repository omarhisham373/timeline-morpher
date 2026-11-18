import { OfflineError } from "./types";

type Listener = (online: boolean) => void;

export interface NetworkSnapshot {
  online: boolean;
  simulatedOffline: boolean;
  flaky: boolean;
}

export const SERVER_NETWORK_SNAPSHOT: NetworkSnapshot = { online: true, simulatedOffline: false, flaky: false };

const STORAGE_KEY = "masaro:simulate-offline";

/**
 * Single source of truth for "can we talk to the server?". Combines the real
 * browser signal with a user-controlled simulation (and an optional flaky mode
 * that randomly fails requests, to exercise retry/backoff on demand).
 */
export class NetworkMonitor {
  private simulatedOffline = false;
  private flaky = false;
  private browserOnline = true;
  private listeners = new Set<Listener>();
  private last = true;
  private snap: NetworkSnapshot = SERVER_NETWORK_SNAPSHOT;

  constructor(private readonly random: () => number = Math.random) {
    if (typeof window !== "undefined") {
      this.browserOnline = navigator.onLine;
      try {
        this.simulatedOffline = window.localStorage.getItem(STORAGE_KEY) === "1";
      } catch {
        /* storage blocked: default to online */
      }
      window.addEventListener("online", () => this.setBrowserOnline(true));
      window.addEventListener("offline", () => this.setBrowserOnline(false));
    }
    this.last = this.isOnline();
    this.refreshSnapshot();
  }

  /** Stable snapshot for useSyncExternalStore (identity changes only on change). */
  getSnapshot = (): NetworkSnapshot => this.snap;

  private refreshSnapshot() {
    this.snap = { online: this.isOnline(), simulatedOffline: this.simulatedOffline, flaky: this.flaky };
  }

  isOnline() {
    return this.browserOnline && !this.simulatedOffline;
  }
  isSimulatedOffline() {
    return this.simulatedOffline;
  }
  isFlaky() {
    return this.flaky;
  }

  setSimulatedOffline(value: boolean) {
    this.simulatedOffline = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
    this.notify();
  }

  setFlaky(value: boolean) {
    this.flaky = value;
    this.notify(true);
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** fetch() that respects the simulation and enforces a timeout. */
  async fetch(input: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    if (!this.isOnline()) throw new OfflineError();
    if (this.flaky && this.random() < 0.5) {
      await new Promise((r) => setTimeout(r, 300));
      throw new Error("Simulated flaky network: request dropped");
    }
    const { timeoutMs = 20_000, signal, ...rest } = init;
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      return await fetch(input, { ...rest, signal: combined });
    } catch (err) {
      // A dropped connection mid-request looks like a TypeError; treat as offline if the browser agrees.
      if (!this.isOnline() || (typeof navigator !== "undefined" && !navigator.onLine)) throw new OfflineError();
      if (err instanceof DOMException && err.name === "TimeoutError") throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
      throw err;
    }
  }

  private setBrowserOnline(v: boolean) {
    this.browserOnline = v;
    this.notify();
  }

  private notify(force = false) {
    this.refreshSnapshot();
    const now = this.isOnline();
    if (now === this.last && !force) {
      this.listeners.forEach((l) => l(now)); // e.g. simulation toggled while the browser is offline
      return;
    }
    this.last = now;
    this.listeners.forEach((l) => l(now));
  }
}
