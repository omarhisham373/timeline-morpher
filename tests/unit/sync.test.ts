import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { IdbOutboxStore } from "@/offline/idbStore";
import { MemoryOutboxStore } from "@/offline/memoryStore";
import { SyncEngine, type Transport } from "@/offline/syncEngine";
import { OfflineError, PermanentSyncError, type OutboxItem } from "@/offline/types";
import type { ParseResponse } from "@/parsing/schema";

const RESULT: ParseResponse = { result: { summary: "ok", items: [], notes: [] }, engine: "local", latencyMs: 1 };

function harness(opts: { online?: boolean; transport?: Transport; maxAttempts?: number } = {}) {
  let online = opts.online ?? true;
  let clock = 1_000;
  const timers: { at: number; fn: () => void }[] = [];
  const store = new MemoryOutboxStore();
  const transport = vi.fn<Transport>(opts.transport ?? (async () => ({ kind: "synced", result: RESULT })));
  const engine = new SyncEngine({
    store,
    transport,
    isOnline: () => online,
    maxAttempts: opts.maxAttempts ?? 3,
    backoff: (n) => 1000 * 2 ** (n - 1),
    now: () => clock,
    setTimer: (fn, ms) => {
      const t = { at: clock + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  return {
    engine,
    store,
    transport,
    setOnline: (v: boolean) => (online = v),
    /** Advance fake time and fire due timers. */
    async tick(ms: number) {
      clock += ms;
      for (const t of timers.filter((x) => x.at <= clock)) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
      await flush();
      await engine.drain();
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const note = (id: string, extra: Partial<OutboxItem> = {}) => ({ id, createdAt: Number(id.replace(/\D/g, "")) || 1, source: "typed" as const, transcript: `note ${id}`, ...extra });

describe("SyncEngine", () => {
  it("syncs immediately when online", async () => {
    const h = harness();
    await h.engine.enqueue(note("n1"));
    await h.engine.drain();
    expect((await h.store.get("n1"))!.status).toBe("synced");
    expect((await h.store.get("n1"))!.result).toEqual(RESULT);
  });

  it("keeps notes queued while offline and drains them in order on reconnect", async () => {
    const h = harness({ online: false });
    await h.engine.enqueue(note("n1"));
    await h.engine.enqueue(note("n2"));
    await h.engine.drain();
    expect(h.transport).not.toHaveBeenCalled();
    expect((await h.store.list()).map((i) => i.status)).toEqual(["queued", "queued"]);

    h.setOnline(true);
    await h.engine.notifyOnline();
    expect(h.transport.mock.calls.map((c) => c[0].id)).toEqual(["n1", "n2"]);
    expect((await h.store.list()).every((i) => i.status === "synced")).toBe(true);
  });

  it("retries transient failures with exponential backoff", async () => {
    let calls = 0;
    const h = harness({
      transport: async () => {
        calls++;
        if (calls < 3) throw new Error("502");
        return { kind: "synced", result: RESULT };
      },
    });
    await h.engine.enqueue(note("n1"));
    await h.engine.drain();
    let item = (await h.store.get("n1"))!;
    expect(item).toMatchObject({ status: "queued", attempts: 1, lastError: "502" });
    expect(item.nextAttemptAt).toBe(1_000 + 1_000);

    await h.tick(999); // not yet due
    expect(calls).toBe(1);
    await h.tick(1); // first retry, fails again → waits 2s
    item = (await h.store.get("n1"))!;
    expect(item).toMatchObject({ attempts: 2, status: "queued" });
    await h.tick(2_000);
    expect((await h.store.get("n1"))!.status).toBe("synced");
  });

  it("gives up after maxAttempts and supports a manual retry", async () => {
    const h = harness({ maxAttempts: 2, transport: async () => Promise.reject(new Error("down")) });
    await h.engine.enqueue(note("n1"));
    await h.engine.drain();
    await h.tick(1_000);
    expect((await h.store.get("n1"))!).toMatchObject({ status: "failed", attempts: 2 });
    h.transport.mockImplementation(async () => ({ kind: "synced", result: RESULT }));
    await h.engine.retry("n1");
    expect((await h.store.get("n1"))!.status).toBe("synced");
  });

  it("does not burn retries on permanent (4xx) errors", async () => {
    const h = harness({ transport: async () => Promise.reject(new PermanentSyncError("422")) });
    await h.engine.enqueue(note("n1"));
    await h.engine.drain();
    expect((await h.store.get("n1"))!).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("treats going offline mid-sync as a pause, not a failure", async () => {
    // The connection drops while the request is in flight.
    const h = harness({
      transport: async () => {
        h.setOnline(false);
        throw new OfflineError();
      },
    });
    await h.engine.enqueue(note("n1"));
    await h.engine.enqueue(note("n2"));
    await h.engine.drain();
    expect(h.transport).toHaveBeenCalledTimes(1); // stops the run instead of hammering
    expect((await h.store.get("n1"))!).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("is single-flight: concurrent drains never double-send", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness({
      transport: async () => {
        await gate;
        return { kind: "synced", result: RESULT };
      },
    });
    await h.store.put({ ...note("n1"), status: "queued", attempts: 0, nextAttemptAt: 0 });
    const runs = [h.engine.drain(), h.engine.drain(), h.engine.notifyOnline()];
    release();
    await Promise.all(runs);
    expect(h.transport).toHaveBeenCalledTimes(1);
  });

  it("re-queues items left 'syncing' by a crash on startup", async () => {
    const h = harness();
    await h.store.put({ ...note("n1"), status: "syncing", attempts: 0, nextAttemptAt: 999 });
    await h.engine.start();
    expect((await h.store.get("n1"))!.status).toBe("synced");
  });

  it("parks audio-only notes that cannot be transcribed", async () => {
    const h = harness({ transport: async () => ({ kind: "needs_transcript" }) });
    await h.engine.enqueue(note("n1", { transcript: "" }));
    await h.engine.drain();
    expect((await h.store.get("n1"))!.status).toBe("needs_transcript");
  });

  it("notifies subscribers with the latest list", async () => {
    const h = harness({ online: false });
    const seen: string[][] = [];
    h.engine.subscribe((items) => seen.push(items.map((i) => i.status)));
    await h.engine.enqueue(note("n1"));
    await flush();
    expect(seen.at(-1)).toEqual(["queued"]);
  });
});

describe("IdbOutboxStore", () => {
  it("persists items including the audio Blob", async () => {
    const store = new IdbOutboxStore();
    const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
    await store.put({ ...note("a1"), audio, status: "queued", attempts: 0, nextAttemptAt: 0 });
    await store.put({ ...note("a0", { createdAt: 0 }), status: "queued", attempts: 0, nextAttemptAt: 0 });
    const list = await store.list();
    expect(list.map((i) => i.id)).toEqual(["a0", "a1"]); // ordered by createdAt
    const got = await store.get("a1");
    expect(got!.audio).toBeInstanceOf(Blob);
    expect(new Uint8Array(await got!.audio!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    await store.delete("a1");
    expect(await store.get("a1")).toBeUndefined();
  });
});
