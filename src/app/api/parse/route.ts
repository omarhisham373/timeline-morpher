import { computeSchedule } from "@/domain/cpm";
import type { ParseResponse } from "@/parsing/schema";
import { formatZodError } from "@/parsing/schema";
import { IdempotencyCache } from "@/server/idempotency";
import { parseNote } from "@/server/parseService";
import { ParseRequestSchema } from "@/server/projectSchema";

const cache = new IdempotencyCache<ParseResponse>();
const MAX_BODY_BYTES = 200_000;

export async function POST(request: Request) {
  const key = request.headers.get("idempotency-key");
  const cached = cache.get(key);
  if (cached) return Response.json(cached, { headers: { "x-idempotent-replay": "true" } });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: formatZodError(parsed.error) }, { status: 422 });

  try {
    computeSchedule(parsed.data.project); // rejects cyclic / dangling projects up front
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }

  const result = await parseNote(parsed.data.transcript, parsed.data.project);
  cache.set(key, result);
  return Response.json(result);
}
