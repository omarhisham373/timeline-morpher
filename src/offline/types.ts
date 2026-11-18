import type { ParseResponse } from "@/parsing/schema";

export type OutboxStatus = "queued" | "syncing" | "synced" | "failed" | "needs_transcript";
export type CaptureSource = "mic" | "sample" | "typed";

/** One captured field note waiting for (or done with) server processing. */
export interface OutboxItem {
  id: string;
  createdAt: number;
  source: CaptureSource;
  /** Raw recording. Optional: typed notes have no audio. */
  audio?: Blob;
  audioType?: string;
  durationMs?: number;
  /** Best transcript we have on-device (Web Speech / bundled caption / typed). */
  transcript: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  result?: ParseResponse;
  /** Set once the reviewer has applied or discarded the result. */
  reviewed?: boolean;
}

export interface OutboxStore {
  put(item: OutboxItem): Promise<void>;
  get(id: string): Promise<OutboxItem | undefined>;
  list(): Promise<OutboxItem[]>;
  delete(id: string): Promise<void>;
}

export class OfflineError extends Error {
  constructor(message = "You're offline — saved on this device and will sync automatically.") {
    super(message);
    this.name = "OfflineError";
  }
}

/** Server said the item can never succeed as-is (4xx): don't burn retries on it. */
export class PermanentSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentSyncError";
  }
}
