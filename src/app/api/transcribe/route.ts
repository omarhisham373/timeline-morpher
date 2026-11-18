import { getSttConfig } from "@/server/llmConfig";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Optional server-side speech-to-text (OpenAI-compatible /audio/transcriptions,
 * e.g. Groq's free Whisper). Without configuration it answers 501 and the
 * client falls back to the browser transcript or asks the user to type it.
 */
export async function POST(request: Request) {
  const config = getSttConfig();
  if (!config) return Response.json({ error: "Server speech-to-text is not configured" }, { status: 501 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "Missing audio" }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Audio too large (25 MB max)" }, { status: 413 });

  const upstream = new FormData();
  upstream.append("file", audio, (audio as File).name || "note.webm");
  upstream.append("model", config.model);
  upstream.append("language", "en");
  upstream.append("prompt", "Construction site field note: rebar, slab pour, HVAC, drywall, rough-in, inspection.");
  try {
    const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
      body: upstream,
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok) return Response.json({ error: `STT provider HTTP ${res.status}` }, { status: 502 });
    const body = (await res.json()) as { text?: string };
    return Response.json({ text: body.text ?? "", provider: config.provider });
  } catch (err) {
    return Response.json({ error: `STT provider unreachable: ${(err as Error).message}` }, { status: 502 });
  }
}
