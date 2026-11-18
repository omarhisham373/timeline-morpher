/**
 * Canvas renderer for the live waveform: a scrolling amplitude history
 * ("voice memo" bars) with the instantaneous oscilloscope trace on top.
 */

export interface WaveformState {
  history: number[];
  lastPush: number;
}

export const createWaveformState = (): WaveformState => ({ history: [], lastPush: 0 });

export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analyser: AnalyserNode | null,
  state: WaveformState,
  now: number,
  colors: { bar: string; trace: string; idle: string },
) {
  ctx.clearRect(0, 0, width, height);
  const mid = height / 2;
  const barW = 3;
  const gap = 2;
  const maxBars = Math.floor(width / (barW + gap));

  let samples: Float32Array<ArrayBuffer> | null = null;
  if (analyser) {
    samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    if (now - state.lastPush > 45) {
      // Perceptual boost so quiet speech is still visible.
      state.history.push(Math.min(1, Math.pow(rms(samples) * 4, 0.7)));
      if (state.history.length > maxBars) state.history.splice(0, state.history.length - maxBars);
      state.lastPush = now;
    }
  }

  // History bars, newest on the right.
  const start = width - state.history.length * (barW + gap);
  ctx.fillStyle = colors.bar;
  state.history.forEach((v, i) => {
    const h = Math.max(2, v * (height - 8));
    const x = start + i * (barW + gap);
    ctx.globalAlpha = 0.35 + 0.65 * (i / Math.max(1, state.history.length));
    ctx.fillRect(x, mid - h / 2, barW, h);
  });
  ctx.globalAlpha = 1;

  // Idle baseline / live trace.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = samples ? colors.trace : colors.idle;
  ctx.beginPath();
  if (samples) {
    const step = Math.max(1, Math.floor(samples.length / width));
    for (let x = 0; x < width; x++) {
      const y = mid + samples[x * step] * mid * 0.9;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else {
    ctx.setLineDash([2, 6]);
    ctx.moveTo(0, mid);
    ctx.lineTo(width, mid);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
