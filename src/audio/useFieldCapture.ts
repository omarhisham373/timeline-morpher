"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptureSource } from "@/offline/types";
import { MAX_RECORDING_MS, describeMediaError, startRecording, type ActiveRecording } from "./recorder";
import { captionAt, loadSampleClip, type SampleClip } from "./sampleClip";
import { startLiveTranscription, type LiveTranscriber } from "./speech";

export type CapturePhase = "idle" | "recording" | "playing" | "ready";

export interface PendingCapture {
  source: CaptureSource;
  audio?: Blob;
  durationMs?: number;
}

/**
 * State machine for one field note:
 *
 *   idle ──record──▶ recording ──stop──▶ ready ──(submit)──▶ idle
 *     └──sample───▶ playing ──end/skip──▶ ready
 *
 * Mic and sample playback both feed an AnalyserNode so the same waveform
 * component renders either. Live captions come from the Web Speech API (mic)
 * or the bundled word timings (sample).
 */
export function useFieldCapture({ online }: { online: boolean }) {
  const [phase, setPhase] = useState<CapturePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [clip, setClip] = useState<SampleClip | null>(null);

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

  const begin = (next: CapturePhase, node: AnalyserNode) => {
    setAnalyser(node);
    setTranscript("");
    setPending(null);
    startedAtRef.current = performance.now();
    setElapsed(0);
    setPhase(next);
  };

  // Status messages fade out on their own.
  useEffect(() => {
    if (!info) return;
    const id = window.setTimeout(() => setInfo(null), 6000);
    return () => window.clearTimeout(id);
  }, [info]);

  // Elapsed timer while capturing.
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

  // Hard stop at the maximum length (keeps IndexedDB usage bounded).
  useEffect(() => {
    if (phase === "recording" && elapsed >= MAX_RECORDING_MS) void stopRecording();
  }, [elapsed, phase, stopRecording]);

  const startMic = async () => {
    setError(null);
    setInfo(null);
    try {
      const rec = await startRecording(audioContext());
      recRef.current = rec;
      begin("recording", rec.analyser);
      sttRef.current = online
        ? startLiveTranscription({
            onText: (finalText, interimText) => {
              setTranscript(finalText);
              setInterim(interimText);
            },
            onError: setInfo,
          })
        : null;
      if (!sttRef.current)
        setInfo(
          online
            ? "Live captions aren't available in this browser — the audio will be transcribed on sync, or type it below."
            : "Offline: recording to this device. It will be transcribed and synced when you reconnect.",
        );
    } catch (err) {
      setError(describeMediaError(err).message);
    }
  };

  const finishSample = useCallback(async (sample: SampleClip) => {
    cancelAnimationFrame(rafRef.current);
    audioElRef.current?.pause();
    audioElRef.current = null;
    setAnalyser(null);
    setTranscript(sample.text);
    let audio: Blob | undefined;
    try {
      audio = await (await fetch(sample.audioUrl)).blob();
    } catch {
      audio = undefined; // the bundled transcript is enough to continue
    }
    setPending({ source: "sample", audio, durationMs: Math.round((sample.words.at(-1)?.t ?? 0) * 1000) + 800 });
    setPhase("ready");
  }, []);

  const playSample = async () => {
    setError(null);
    setInfo(null);
    let sample = clip;
    try {
      sample ??= await loadSampleClip();
      setClip(sample);
      const ctx = audioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const el = new Audio(sample.audioUrl);
      const node = ctx.createAnalyser();
      node.fftSize = 2048;
      ctx.createMediaElementSource(el).connect(node);
      node.connect(ctx.destination);
      audioElRef.current = el;
      begin("playing", node);
      const loaded = sample;
      el.onended = () => void finishSample(loaded);
      const tick = () => {
        setTranscript(captionAt(loaded, el.currentTime));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      await el.play();
    } catch (err) {
      // Autoplay blocked / no audio device: fall back to the transcript instantly.
      if (sample) {
        setInfo(`Couldn't play audio (${(err as Error).message}). Loaded the sample transcript instead.`);
        await finishSample(sample);
      } else setError("Couldn't load the sample field note.");
    }
  };

  const release = () => {
    recRef.current?.cancel();
    recRef.current = null;
    sttRef.current?.stop();
    sttRef.current = null;
    audioElRef.current?.pause();
    audioElRef.current = null;
    cancelAnimationFrame(rafRef.current);
  };

  const reset = () => {
    release();
    setAnalyser(null);
    setPending(null);
    setTranscript("");
    setInterim("");
    setPhase("idle");
    setElapsed(0);
  };

  // Release the mic / audio on unmount.
  useEffect(() => () => release(), []);

  return {
    phase,
    busy: phase === "recording" || phase === "playing",
    transcript,
    setTranscript,
    interim,
    error,
    setError,
    info,
    setInfo,
    elapsed,
    analyser,
    pending,
    clip,
    startMic,
    stopRecording,
    playSample,
    finishSample,
    reset,
  };
}
