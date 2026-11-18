import type { Project } from "@/domain/types";
import { IdbOutboxStore, isIndexedDbAvailable } from "@/offline/idbStore";
import { MemoryOutboxStore } from "@/offline/memoryStore";
import { NetworkMonitor } from "@/offline/network";
import { SyncEngine } from "@/offline/syncEngine";
import { createHttpTransport } from "@/offline/transport";

export interface Runtime {
  net: NetworkMonitor;
  engine: SyncEngine;
  storageKind: "indexeddb" | "memory";
}

let runtime: Runtime | null = null;

/** Browser-only singletons (network monitor + outbox sync engine). Never call during SSR. */
export function getRuntime(getProject: () => Project): Runtime {
  if (runtime) return runtime;
  const net = new NetworkMonitor();
  const storageKind = isIndexedDbAvailable() ? "indexeddb" : "memory";
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const engine = new SyncEngine({
    store: storageKind === "indexeddb" ? new IdbOutboxStore() : new MemoryOutboxStore(),
    transport: createHttpTransport(net, getProject),
    isOnline: () => net.isOnline(),
    withLock: locks ? <T,>(fn: () => Promise<T>) => locks.request("masaro-outbox-sync", fn) as Promise<T> : undefined,
  });
  runtime = { net, engine, storageKind };
  return runtime;
}
