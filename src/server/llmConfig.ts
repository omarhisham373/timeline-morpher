import "server-only";

/**
 * Pluggable OpenAI-compatible providers. Everything is optional: with no env
 * vars the app runs entirely on the local parser and browser speech APIs.
 *
 *   LLM_PROVIDER = openai | gemini | groq | openrouter | ollama | custom
 *   LLM_API_KEY, LLM_MODEL, LLM_BASE_URL (override), LLM_TIMEOUT_MS
 *   STT_PROVIDER = openai | groq | custom   STT_API_KEY, STT_MODEL, STT_BASE_URL
 *
 * Gemini, Groq and Ollama all have free options (Ollama runs locally).
 */

const PRESETS: Record<string, { baseUrl: string; model: string; sttModel?: string; keyless?: boolean }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", sttModel: "whisper-1" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", sttModel: "whisper-large-v3-turbo" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.1", keyless: true },
};

export interface ProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Request timeout; local CPU models (Ollama) need longer than hosted APIs. */
  timeoutMs: number;
}

type Env = Record<string, string | undefined>;

function resolve(prefix: "LLM" | "STT", rawEnv: Env): ProviderConfig | null {
  // Treat blank values (e.g. an untouched `LLM_MODEL=` from .env.example) as unset.
  const env = (key: string) => rawEnv[key]?.trim() || undefined;
  const provider = (env(`${prefix}_PROVIDER`) ?? "").toLowerCase();
  if (!provider || provider === "none" || provider === "local") return null;
  const preset = PRESETS[provider];
  const baseUrl = env(`${prefix}_BASE_URL`) ?? preset?.baseUrl;
  const model = env(`${prefix}_MODEL`) ?? (prefix === "STT" ? preset?.sttModel : preset?.model);
  const apiKey = env(`${prefix}_API_KEY`) ?? (prefix === "STT" ? env("LLM_API_KEY") : undefined);
  if (!baseUrl || !model) return null;
  if (!apiKey && !preset?.keyless && provider !== "custom") return null;
  const timeoutMs = Number(env(`${prefix}_TIMEOUT_MS`)) || (preset?.keyless ? 90_000 : 15_000);
  return { provider, baseUrl: baseUrl.replace(/\/$/, ""), apiKey, model, timeoutMs };
}

export const getLlmConfig = (env: Env = process.env) => resolve("LLM", env);
export const getSttConfig = (env: Env = process.env) => resolve("STT", env);
