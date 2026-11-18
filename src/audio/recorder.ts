/**
 * Microphone capture: MediaRecorder for the file, an AnalyserNode for the live
 * waveform. Framework-free so the React hook stays thin.
 */

export const MAX_RECORDING_MS = 120_000;

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function pickMimeType(isSupported: (t: string) => boolean = (t) => MediaRecorder.isTypeSupported(t)): string | undefined {
  return MIME_CANDIDATES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}

export class RecorderError extends Error {
  constructor(message: string, public readonly code: "permission" | "no-device" | "insecure" | "unsupported" | "unknown") {
    super(message);
    this.name = "RecorderError";
  }
}

export function describeMediaError(err: unknown): RecorderError {
  if (err instanceof RecorderError) return err;
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return new RecorderError("Microphone access was blocked. Allow it in the browser's site settings, or use the sample field note.", "permission");
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return new RecorderError("No microphone found. Plug one in, or use the sample field note.", "no-device");
  if (name === "NotReadableError") return new RecorderError("The microphone is busy in another app.", "no-device");
  return new RecorderError((err as Error)?.message || "Could not start recording", "unknown");
}

export interface ActiveRecording {
  analyser: AnalyserNode;
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
  cancel: () => void;
}

export async function startRecording(audioContext: AudioContext): Promise<ActiveRecording> {
  if (typeof window !== "undefined" && !window.isSecureContext)
    throw new RecorderError("Recording needs HTTPS (or localhost).", "insecure");
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
    throw new RecorderError("This browser can't record audio. Use the sample field note instead.", "unsupported");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    throw describeMediaError(err);
  }
  if (audioContext.state === "suspended") await audioContext.resume();

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const startedAt = performance.now();
  recorder.start(250);

  const release = () => {
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    analyser,
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }), durationMs: Math.round(performance.now() - startedAt) });
        };
        if (recorder.state !== "inactive") recorder.stop();
        else recorder.onstop(new Event("stop"));
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
