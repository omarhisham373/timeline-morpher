import { connection } from "next/server";
import { getLlmConfig, getSttConfig } from "@/server/llmConfig";

/** Which engines are active. Never exposes keys or base URLs. */
export async function GET() {
  await connection(); // read env at request time, not build time
  const llm = getLlmConfig();
  const stt = getSttConfig();
  return Response.json({
    llm: llm ? { provider: llm.provider, model: llm.model } : null,
    stt: stt ? { provider: stt.provider, model: stt.model } : null,
  });
}
