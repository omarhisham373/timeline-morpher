import "server-only";
import type { Project } from "@/domain/types";
import { parseFieldNote } from "@/parsing/localParser";
import { reconcile } from "@/parsing/reconcile";
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
      const llmResult = await llm(transcript, project, config);
      // Cross-check with the deterministic engine (≈1 ms) so the reviewer sees where they disagree.
      const { result, checks, suggestions } = reconcile(transcript, llmResult, parseFieldNote(transcript, project));
      return {
        result,
        checks: { items: checks, suggestions: suggestions.map((s) => ({ item: s.item, detail: s.check.detail ?? "" })) },
        engine: "llm",
        model: `${config.provider}:${config.model}`,
        latencyMs: Date.now() - started,
      };
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
