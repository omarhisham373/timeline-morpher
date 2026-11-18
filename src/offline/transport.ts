import type { Project } from "@/domain/types";
import type { ParseResponse } from "@/parsing/schema";
import type { NetworkMonitor } from "./network";
import type { Transport } from "./syncEngine";
import { PermanentSyncError } from "./types";

/** HTTP transport for the outbox: (optional) server STT, then parse. */
export function createHttpTransport(net: NetworkMonitor, getProject: () => Project): Transport {
  return async (item, signal) => {
    let transcript = item.transcript.trim();

    if (!transcript && item.audio) {
      const form = new FormData();
      form.append("audio", item.audio, `field-note.${extensionFor(item.audioType)}`);
      const res = await net.fetch("/api/transcribe", { method: "POST", body: form, signal, headers: { "Idempotency-Key": item.id }, timeoutMs: 45_000 });
      if (res.status === 501) return { kind: "needs_transcript" };
      await assertOk(res);
      transcript = String(((await res.json()) as { text?: string }).text ?? "").trim();
    }
    if (!transcript) return { kind: "needs_transcript" };

    const res = await net.fetch("/api/parse", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": item.id },
      body: JSON.stringify({ transcript, project: getProject() }),
      signal,
    });
    await assertOk(res);
    return { kind: "synced", result: (await res.json()) as ParseResponse, transcript };
  };
}

async function assertOk(res: Response) {
  if (res.ok) return;
  let detail = res.statusText;
  try {
    detail = ((await res.json()) as { error?: string }).error ?? detail;
  } catch {
    /* non-JSON body */
  }
  // 4xx (except timeout / rate limit) will fail the same way every time.
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    throw new PermanentSyncError(`Server rejected the note (${res.status}): ${detail}`);
  }
  throw new Error(`Server error ${res.status}: ${detail}`);
}

function extensionFor(type?: string) {
  if (!type) return "webm";
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg")) return "mp3";
  return "webm";
}
