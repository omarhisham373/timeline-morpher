/**
 * Thin wrapper over the Web Speech API (Chrome/Edge/Safari). It streams
 * interim + final text while the MediaRecorder captures the audio file.
 * Note: Chrome's implementation uses a cloud service, so it does not work
 * offline — in that case the recording is queued and transcribed on sync.
 */

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type Ctor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface LiveTranscriber {
  stop: () => void;
}

export function startLiveTranscription(handlers: {
  onText: (finalText: string, interim: string) => void;
  onError: (message: string) => void;
}): LiveTranscriber | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  let finalText = "";
  let stopped = false;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
      else interim += r[0].transcript;
    }
    handlers.onText(finalText, interim.trim());
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    handlers.onError(
      e.error === "network"
        ? "Live captions need a connection — the audio is still saved and will be transcribed on sync."
        : e.error === "not-allowed"
          ? "Speech recognition was blocked; the audio is still recorded."
          : `Live captions stopped (${e.error}).`,
    );
  };
  // Chrome ends continuous sessions after silence; restart until told to stop.
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  };
  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      stopped = true;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
