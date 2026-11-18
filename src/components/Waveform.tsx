"use client";

import { useEffect, useRef } from "react";
import { createWaveformState, drawWaveform } from "@/audio/waveform";

/** Real-time canvas waveform driven by an AnalyserNode (mic or sample clip). */
export function Waveform({ analyser, active, label }: { analyser: AnalyserNode | null; active: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(createWaveformState());

  useEffect(() => {
    if (active) stateRef.current = createWaveformState();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const colors = { bar: "#faca38", trace: "rgba(255,255,255,0.75)", idle: "#3d3d3d" };
    const loop = (t: number) => {
      drawWaveform(ctx, width, height, active ? analyser : null, stateRef.current, t, colors);
      if (active) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      data-testid="waveform"
      data-active={active ? "true" : "false"}
      className="h-24 w-full rounded-xl border border-ink-600 bg-ink-950"
    />
  );
}
