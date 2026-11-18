/** The bundled sample field note: audio + word-level timings for live captions. */

export interface TimedWord {
  w: string;
  /** start (s) */
  t: number;
  /** duration (s) */
  d: number;
}

export interface SampleClip {
  id: string;
  title: string;
  speaker: string;
  audioUrl: string;
  text: string;
  words: TimedWord[];
}

export const SAMPLE_CLIP_META = {
  id: "riverside-0612",
  title: "Riverside · morning walk",
  speaker: "Mike R., superintendent",
  audioUrl: "/samples/field-note-riverside.mp3",
  transcriptUrl: "/samples/field-note-riverside.json",
};

export async function loadSampleClip(fetchImpl: typeof fetch = fetch): Promise<SampleClip> {
  const res = await fetchImpl(SAMPLE_CLIP_META.transcriptUrl);
  if (!res.ok) throw new Error("Sample transcript missing");
  const body = (await res.json()) as { text: string; words: TimedWord[] };
  return { ...SAMPLE_CLIP_META, text: body.text, words: body.words };
}

/**
 * Text "heard so far" at playback time `seconds`. Rebuilds from the original
 * text (keeping punctuation) by cutting after the last word that has started.
 */
export function captionAt(clip: Pick<SampleClip, "text" | "words">, seconds: number): string {
  let cursor = 0;
  let cut = 0;
  for (const word of clip.words) {
    const idx = clip.text.indexOf(word.w, cursor);
    if (idx === -1) continue;
    cursor = idx + word.w.length;
    if (word.t <= seconds) cut = cursor;
    else break;
  }
  if (cut === 0) return "";
  // Include trailing punctuation that belongs to the last word.
  const rest = /^[,.!?;:']+/.exec(clip.text.slice(cut));
  return clip.text.slice(0, cut + (rest ? rest[0].length : 0));
}
