"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_RECORDING_MS, describeMediaError, startRecording, type ActiveRecording } from "@/audio/recorder";
import { captionAt, loadSampleClip, SAMPLE_CLIP_META, type SampleClip } from "@/audio/sampleClip";
import { speechRecognitionCtor, startLiveTranscription, type LiveTranscriber } from "@/audio/speech";
import type { CaptureSource } from "@/offline/types";
import { useApp } from "@/state/AppProvider";
import { Badge, Button, Card, Kbd, cx } from "./ui/primitives";
import { Waveform } from "./Waveform";

type Phase = "idle" | "recording" | "playing" | "ready";

interface Pending {
  source: CaptureSource;
  audio?: Blob;
  durationMs?: number;
}

const noopSubscribe = () => () => {};
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function CapturePanel() {
  const { capture, online, engineConfig } = useApp();
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [clip, setClip] = useState<SampleClip | null>(null);
  const speechSupported = useSyncExternalStore(noopSubscribe, () => !!speechRecognitionCtor(), () => true);

  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<ActiveRecording | null>(null);
  const sttRef = useRef<LiveTranscriber | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);

  const audioContext = () => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current;
  };

  // Elapsed timer + hard stop at the max length.
  useEffect(() => {
    if (phase !== "recording" && phase !== "playing") return;
    const id = window.setInterval(() => setElapsed(performance.now() - startedAtRef.current), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  const stopRecording = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    const { blob, durationMs } = await rec.stop();
    setAnalyser(null);
    setInterim("");
    setPending({ source: "mic", audio: blob, durationMs });
    setPhase("ready");
  }, []);

  useEffect(() => {
    if (phase === "recording" && elapsed >= MAX_RECORDING_MS) void stopRecording();
  }, [elapsed, phase, stopRecording]);

  const startMic = async () => {
    setError(null);
    setInfo(null);
    try {
      const rec = await startRecording(audioContext());
      recRef.current = rec;
      setAnalyser(rec.analyser);
      setTranscript("");
      setPending(null);
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase("recording");
      sttRef.current = online
        ? startLiveTranscription({
            onText: (finalText, interimText) => {
              setTranscript(finalText);
              setInterim(interimText);
            },
            onError: (m) => setInfo(m),
          })
        : null;
      if (!sttRef.current)
        setInfo(online ? "Live captions aren't available in this browser — the audio will be transcribed on sync, or type it below." : "Offline: recording to this device. It will be transcribed and synced when you reconnect.");
    } catch (err) {
      setError(describeMediaError(err).message);
    }
  };

  const finishSample = useCallback(async (clip: SampleClip) => {
    cancelAnimationFrame(rafRef.current);
    const el = audioElRef.current;
    audioElRef.current = null;
    el?.pause();
    setAnalyser(null);
    setTranscript(clip.text);
    let audio: Blob | undefined;
    try {
      audio = await (await fetch(clip.audioUrl)).blob();
    } catch {
      audio = undefined; // the bundled transcript is enough to continue
    }
    setPending({ source: "sample", audio, durationMs: Math.round((clip.words.at(-1)?.t ?? 0) * 1000) + 800 });
    setPhase("ready");
  }, []);

  const playSample = async () => {
    setError(null);
    setInfo(null);
    try {
      const loaded = clip ?? (await loadSampleClip());
      setClip(loaded);
      const ctx = audioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const el = new Audio(loaded.audioUrl);
      el.preload = "auto";
      const source = ctx.createMediaElementSource(el);
      const node = ctx.createAnalyser();
      node.fftSize = 2048;
      source.connect(node);
      node.connect(ctx.destination);
      audioElRef.current = el;
      setAnalyser(node);
      setTranscript("");
      setPending(null);
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase("playing");
      el.onended = () => void finishSample(loaded);
      const tick = () => {
        setTranscript(captionAt(loaded, el.currentTime));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      await el.play();
    } catch (err) {
      // Autoplay blocked or no audio output: fall back to the transcript instantly.
      const fallback = clip ?? (await loadSampleClip().catch(() => null));
      if (fallback) {
        setClip(fallback);
        setInfo(`Couldn't play audio (${(err as Error).message}). Loaded the sample transcript instead.`);
        await finishSample(fallback);
      } else setError("Couldn't load the sample field note.");
    }
  };

  const submit = async () => {
    const text = transcript.trim();
    if (!text && !pending?.audio) {
      setError("Record, play the sample, or type a field note first.");
      return;
    }
    try {
      await capture({ source: pending?.source ?? "typed", transcript: text, audio: pending?.audio, durationMs: pending?.durationMs });
      setInfo(online ? "Sent — parsing now." : "Saved offline in IndexedDB. It will sync automatically when you're back online.");
      setTranscript("");
      setPending(null);
      setPhase("idle");
      setElapsed(0);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const discard = () => {
    recRef.current?.cancel();
    recRef.current = null;
    sttRef.current?.stop();
    audioElRef.current?.pause();
    cancelAnimationFrame(rafRef.current);
    setAnalyser(null);
    setPending(null);
    setTranscript("");
    setInterim("");
    setPhase("idle");
    setElapsed(0);
  };

  // Keyboard: R = record/stop, S = sample (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (phase === "recording") void stopRecording();
        else if (phase !== "playing") void startMic();
      }
      if ((e.key === "s" || e.key === "S") && phase === "idle") {
        e.preventDefault();
        void playSample();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Release the mic / audio on unmount.
  useEffect(
    () => () => {
      recRef.current?.cancel();
      sttRef.current?.stop();
      audioElRef.current?.pause();
      cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const busy = phase === "recording" || phase === "playing";
  const engineLabel = engineConfig?.llm ? `LLM · ${engineConfig.llm.model}` : "On-device parser";

  return (
    <Card
      id="capture"
      eyebrow="1 · Capture"
      title="Field note"
      actions={
        <>
          <Badge tone={engineConfig?.llm ? "blue" : "neutral"}>{engineLabel}</Badge>
          <Badge tone={speechSupported ? "green" : "neutral"}>{speechSupported ? "Live captions" : "No live STT"}</Badge>
        </>
      }
    >
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (phase === "recording" ? void stopRecording() : void startMic())}
            disabled={phase === "playing"}
            aria-pressed={phase === "recording"}
            aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
            data-testid="record-button"
            className={cx(
              "focus-ring grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-40",
              phase === "recording" ? "rec-pulse border-delay bg-delay/20" : "border-amber bg-amber/10 hover:bg-amber/20",
            )}
          >
            {phase === "recording" ? <span className="h-5 w-5 rounded-sm bg-delay" /> : <MicIcon />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white" aria-live="polite">
              {phase === "recording" ? "Recording… tap to stop" : phase === "playing" ? `Playing: ${SAMPLE_CLIP_META.title}` : phase === "ready" ? "Review the transcript, then send" : "Tap the mic and talk like you're on site"}
            </p>
            <p className="font-mono text-xs text-mute tabular-nums">
              {busy ? fmt(elapsed) : pending?.durationMs ? `${fmt(pending.durationMs)} captured` : `max ${fmt(MAX_RECORDING_MS)}`} · <Kbd>R</Kbd> record · <Kbd>S</Kbd> sample
            </p>
          </div>
        </div>

        <Waveform analyser={analyser} active={busy} label={busy ? "Live audio waveform" : "Waveform idle"} />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void playSample()} disabled={busy} data-testid="sample-button">
            <PlayIcon /> Play sample field note
          </Button>
          {phase === "playing" && clip && (
            <Button size="sm" variant="ghost" onClick={() => void finishSample(clip)} data-testid="skip-sample">
              Skip to end ⏭
            </Button>
          )}
          {(phase === "ready" || transcript) && !busy && (
            <Button size="sm" variant="ghost" onClick={discard}>
              Discard
            </Button>
          )}
        </div>

        <div>
          <label htmlFor="transcript" className="mb-1 flex items-center justify-between text-xs text-mute">
            <span>Transcript {phase === "recording" && interim && <span className="text-amber">· listening</span>}</span>
            <span className="text-faint">editable — fix any mis-heard words</span>
          </label>
          <textarea
            id="transcript"
            data-testid="transcript"
            value={phase === "recording" && interim ? `${transcript} ${interim}`.trim() : transcript}
            onChange={(e) => setTranscript(e.target.value)}
            readOnly={busy}
            rows={5}
            maxLength={5000}
            placeholder={'e.g. "Concrete truck broke down, pour in Area B is pushed a day. Drywall can\'t start till the inspector signs off."'}
            className="focus-ring w-full resize-y rounded-xl border border-ink-600 bg-ink-950 p-3 text-sm leading-relaxed text-white placeholder:text-faint"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-delay/40 bg-delay/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
        {info && !error && (
          <p role="status" className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-mute" data-testid="capture-info">
            {info}
          </p>
        )}

        <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={busy || (!transcript.trim() && !pending?.audio)} data-testid="process-button">
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
