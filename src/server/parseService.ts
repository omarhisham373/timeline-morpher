import "server-only";
import type { Project } from "@/domain/types";
import { parseFieldNote } from "@/parsing/localParser";
import type { ParseResponse } from "@/parsing/schema";
import { getLlmConfig, type ProviderConfig } from "./llmConfig";
import { parseWithLlm } from "./llmParser";

/**
 * LLM first (when configured), deterministic parser always as the safety net.
 * The UI is told which engine answered and why a fallback happened.
 */
export async function parseNote(
  transcript: string,
  project: Project,
  config: ProviderConfig | null = getLlmConfig(),
  llm: typeof parseWithLlm = parseWithLlm,
): Promise<ParseResponse> {
  const started = Date.now();
  if (config && transcript.trim()) {
    try {
      const result = await llm(transcript, project, config);
      return { result, engine: "llm", model: `${config.provider}:${config.model}`, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        result: parseFieldNote(transcript, project),
        engine: "local",
        fallbackReason: (err as Error).message,
        latencyMs: Date.now() - started,
      };
    }
  }
  return { result: parseFieldNote(transcript, project), engine: "local", latencyMs: Date.now() - started };
}
