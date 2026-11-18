"use client";

import { useEffect, useSyncExternalStore } from "react";
import { MAX_RECORDING_MS } from "@/audio/recorder";
import { SAMPLE_CLIP_META } from "@/audio/sampleClip";
import { speechRecognitionCtor } from "@/audio/speech";
import { useFieldCapture } from "@/audio/useFieldCapture";
import { useApp } from "@/state/AppProvider";
import { Badge, Button, Card, Kbd, cx } from "./ui/primitives";
import { Waveform } from "./Waveform";

const noopSubscribe = () => () => {};
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function CapturePanel() {
  const { capture, online, engineConfig } = useApp();
  const c = useFieldCapture({ online });
  const speechSupported = useSyncExternalStore(noopSubscribe, () => !!speechRecognitionCtor(), () => true);

  const submit = async () => {
    const text = c.transcript.trim();
    if (!text && !c.pending?.audio) {
      c.setError("Record, play the sample, or type a field note first.");
      return;
    }
    try {
      await capture({ source: c.pending?.source ?? "typed", transcript: text, audio: c.pending?.audio, durationMs: c.pending?.durationMs });
      c.reset();
      c.setInfo(online ? "Sent — parsing now." : "Saved offline in IndexedDB. It will sync automatically when you're back online.");
    } catch (err) {
      c.setError((err as Error).message);
    }
  };

  // Keyboard: R = record/stop, S = sample (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (c.phase === "recording") void c.stopRecording();
        else if (c.phase !== "playing") void c.startMic();
      } else if ((e.key === "s" || e.key === "S") && c.phase === "idle") {
        e.preventDefault();
        void c.playSample();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status =
    c.phase === "recording"
      ? "Recording… tap to stop"
      : c.phase === "playing"
        ? `Playing: ${SAMPLE_CLIP_META.title}`
        : c.phase === "ready"
          ? "Review the transcript, then send"
          : "Tap the mic and talk like you're on site";

  return (
    <Card
      id="capture"
      eyebrow="1 · Capture"
      title="Field note"
      actions={
        <>
          <Badge tone={engineConfig?.llm ? "blue" : "neutral"}>{engineConfig?.llm ? `LLM · ${engineConfig.llm.model}` : "On-device parser"}</Badge>
          <Badge tone={speechSupported ? "green" : "neutral"}>{speechSupported ? "Live captions" : "No live STT"}</Badge>
        </>
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (c.phase === "recording" ? void c.stopRecording() : void c.startMic())}
            disabled={c.phase === "playing"}
            aria-pressed={c.phase === "recording"}
            aria-label={c.phase === "recording" ? "Stop recording" : "Start recording"}
            data-testid="record-button"
            className={cx(
              "focus-ring grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-40",
              c.phase === "recording" ? "rec-pulse border-delay bg-delay/20" : "border-amber bg-amber/10 hover:bg-amber/20",
            )}
          >
            {c.phase === "recording" ? <span className="h-5 w-5 rounded-sm bg-delay" /> : <MicIcon />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white" aria-live="polite">
              {status}
            </p>
            <p className="font-mono text-xs text-mute tabular-nums">
              {c.busy ? fmt(c.elapsed) : c.pending?.durationMs ? `${fmt(c.pending.durationMs)} captured` : `max ${fmt(MAX_RECORDING_MS)}`} · <Kbd>R</Kbd> record · <Kbd>S</Kbd> sample
            </p>
          </div>
        </div>

        <Waveform analyser={c.analyser} active={c.busy} label={c.busy ? "Live audio waveform" : "Waveform idle"} />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void c.playSample()} disabled={c.busy} data-testid="sample-button">
            <PlayIcon /> Play sample field note
          </Button>
          {c.phase === "playing" && c.clip && (
            <Button size="sm" variant="ghost" onClick={() => void c.finishSample(c.clip!)} data-testid="skip-sample">
              Skip to end ⏭
            </Button>
          )}
          {(c.phase === "ready" || c.transcript) && !c.busy && (
            <Button size="sm" variant="ghost" onClick={c.reset}>
              Discard
            </Button>
          )}
        </div>

        <div>
          <label htmlFor="transcript" className="mb-1 flex items-center justify-between text-xs text-mute">
            <span>Transcript {c.phase === "recording" && c.interim && <span className="text-amber">· listening</span>}</span>
            <span className="text-faint">editable — fix any mis-heard words</span>
          </label>
          <textarea
            id="transcript"
            data-testid="transcript"
            value={c.phase === "recording" && c.interim ? `${c.transcript} ${c.interim}`.trim() : c.transcript}
            onChange={(e) => c.setTranscript(e.target.value)}
            readOnly={c.busy}
            rows={5}
            maxLength={5000}
            placeholder={'e.g. "Concrete truck broke down, pour in Area B is pushed a day. Drywall can\'t start till the inspector signs off."'}
            className="focus-ring w-full resize-y rounded-xl border border-ink-600 bg-ink-950 p-3 text-sm leading-relaxed text-white placeholder:text-faint"
          />
        </div>

        {c.error && (
          <p role="alert" className="rounded-lg border border-delay/40 bg-delay/10 px-3 py-2 text-xs text-red-200">
            {c.error}
          </p>
        )}
        {c.info && !c.error && (
          <p role="status" className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-mute" data-testid="capture-info">
            {c.info}
          </p>
        )}

        <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={c.busy || (!c.transcript.trim() && !c.pending?.audio)} data-testid="process-button">
          {online ? "Process note → schedule" : "Save offline · sync later"}
        </Button>
      </div>
    </Card>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#faca38" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4v16l13-8z" />
    </svg>
  );
}
