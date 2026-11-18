"use client";

import { useEffect, useState } from "react";
import type { OutboxItem } from "@/offline/types";
import { useApp } from "@/state/AppProvider";
import { Badge, Button, Card } from "./ui/primitives";

const STATUS: Record<OutboxItem["status"], { label: string; tone: "neutral" | "amber" | "red" | "green" | "blue" }> = {
  queued: { label: "Queued", tone: "amber" },
  syncing: { label: "Syncing…", tone: "blue" },
  synced: { label: "Synced", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  needs_transcript: { label: "Needs transcript", tone: "red" },
};

function useNow(active: boolean) {
  // 0 until mounted: the clock is never read during prerender.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 500);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

export function OutboxPanel() {
  const { outbox, online, retryItem, removeItem, openReview, review, storageKind, completeTranscript } = useApp();
  const items = [...outbox].reverse();
  const now = useNow(outbox.some((i) => i.status === "queued"));

  return (
    <Card
      id="outbox"
      eyebrow="2 · Sync"
      title="Outbox"
      actions={<Badge tone={storageKind === "indexeddb" ? "green" : "amber"}>{storageKind === "indexeddb" ? "IndexedDB" : "Memory only"}</Badge>}
    >
      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-mute">Every note is saved on this device first, then synced. Toggle “Simulate offline” and record to watch it queue.</p>
      ) : (
        <ul className="divide-y divide-ink-700" data-testid="outbox-list" aria-live="polite">
          {items.map((item) => {
            const s = STATUS[item.status];
            const wait = now > 0 && item.status === "queued" && item.nextAttemptAt > now ? Math.ceil((item.nextAttemptAt - now) / 1000) : 0;
            return (
              <li key={item.id} className="space-y-1.5 px-4 py-3" data-testid="outbox-item" data-status={item.status}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="truncate text-xs text-mute">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {item.source}
                      {item.audio && ` · ${(item.audio.size / 1024).toFixed(0)} KB audio`}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {item.status === "synced" && !item.reviewed && review?.outboxId !== item.id && (
                      <Button size="sm" variant="outline" onClick={() => openReview(item)}>
                        Review
                      </Button>
                    )}
                    {(item.status === "failed" || (item.status === "queued" && item.attempts > 0)) && (
                      <Button size="sm" variant="outline" onClick={() => retryItem(item.id)} disabled={!online}>
                        Retry now
                      </Button>
                    )}
                    {item.status !== "syncing" && (
                      <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)} aria-label="Remove from outbox">
                        ✕
                      </Button>
                    )}
                  </div>
                </div>
                {item.transcript && <p className="line-clamp-2 text-xs text-faint">“{item.transcript}”</p>}
                {item.status === "queued" && (
                  <p className="text-[11px] text-amber">
                    {!online ? "Waiting for connection — will sync automatically." : wait ? `Retry #${item.attempts + 1} in ${wait}s (exponential backoff)` : "Sending…"}
                    {item.lastError && <span className="text-faint"> · last error: {item.lastError}</span>}
                  </p>
                )}
                {item.status === "failed" && <p className="text-[11px] text-red-300">{item.lastError}</p>}
                {item.status === "synced" && item.result && (
                  <p className="text-[11px] text-mute">
                    {item.result.engine === "llm" ? `Parsed by ${item.result.model}` : "Parsed on the local engine"}
                    {item.result.fallbackReason && ` (LLM fallback: ${item.result.fallbackReason})`} · {item.attempts} attempt{item.attempts > 1 ? "s" : ""}
                    {item.reviewed && " · reviewed"}
                  </p>
                )}
                {item.status === "needs_transcript" && <TranscriptFixer onSubmit={(t) => completeTranscript(item.id, t)} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TranscriptFixer({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type what was said…"
        aria-label="Transcript for this recording"
        className="focus-ring h-8 min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-950 px-2 text-xs"
      />
      <Button size="sm" variant="outline" type="submit">
        Sync
      </Button>
    </form>
  );
}
