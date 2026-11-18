/**
 * Records a real /api/parse response from a running server configured with an
 * LLM (e.g. `LLM_PROVIDER=ollama LLM_MODEL=qwen2.5-3b-local pnpm start`) into
 * tests/e2e/recorded/, so the cross-check UI can be tested without a model.
 *
 *   npx tsx scripts/record-llm-fixture.ts [baseUrl]
 */
import { writeFileSync } from "node:fs";
import { SAMPLE_PROJECT } from "../src/domain/sampleProject";
import clip from "../public/samples/field-note-riverside.json";

async function main() {
  const base = process.argv[2] ?? "http://localhost:3100";
  const res = await fetch(`${base}/api/parse`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript: clip.text, project: SAMPLE_PROJECT }),
  });
  const body = await res.json();
  if (body.engine !== "llm") throw new Error(`Server answered with the ${body.engine} engine (${body.fallbackReason ?? "no LLM configured"})`);
  writeFileSync("tests/e2e/recorded/llm-parse-riverside.json", JSON.stringify(body, null, 2) + "\n");
  console.log(`Recorded ${body.model} · ${body.latencyMs} ms · ${body.result.items.length} items`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
