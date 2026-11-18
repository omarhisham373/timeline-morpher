import { z } from "zod";
import type { ScheduleChange } from "@/domain/changes";
import { MAX_DELAY_DAYS } from "@/domain/changes";

/**
 * The contract between "something that reads a field note" (local parser or an
 * LLM) and the schedule. Every payload is validated with this schema before it
 * reaches the UI, whatever produced it.
 */

const confidence = z.number().min(0).max(1);
const evidence = z.string().trim().min(1).max(500);
const taskId = z.string().trim().min(1).max(64);

export const DelayItemSchema = z.object({
  type: z.literal("delay"),
  taskId,
  delayDays: z.number().positive().max(MAX_DELAY_DAYS),
  reason: z.string().trim().max(200).default(""),
  category: z.enum(["materials", "labor", "weather", "inspection", "equipment", "design", "other"]).default("other"),
  confidence,
  evidence,
  /** True when the duration was not stated and had to be assumed. */
  assumedDuration: z.boolean().default(false),
});

export const DependencyItemSchema = z.object({
  type: z.literal("dependency"),
  taskId,
  dependsOnTaskId: taskId,
  lagDays: z.number().min(0).max(MAX_DELAY_DAYS).default(0),
  reason: z.string().trim().max(200).default(""),
  confidence,
  evidence,
});

export const ParsedItemSchema = z.discriminatedUnion("type", [DelayItemSchema, DependencyItemSchema]);

export const NoteSchema = z.object({
  text: z.string().trim().min(1).max(500),
  kind: z.enum(["on_track", "consequence", "unmatched", "ambiguous"]),
  detail: z.string().max(300).default(""),
});

export const ParsedFieldNoteSchema = z.object({
  summary: z.string().trim().max(400),
  items: z.array(ParsedItemSchema).max(40),
  notes: z.array(NoteSchema).max(40).default([]),
});

export type DelayItem = z.infer<typeof DelayItemSchema>;
export type DependencyItem = z.infer<typeof DependencyItemSchema>;
export type ParsedItem = z.infer<typeof ParsedItemSchema>;
export type ParsedFieldNote = z.infer<typeof ParsedFieldNoteSchema>;
export type ParseNote = z.infer<typeof NoteSchema>;

export type ParseEngine = "local" | "llm";

/** Per-item trust signal from the LLM ↔ rule-engine cross-check (see reconcile.ts). */
export interface ItemCheck {
  agreement: "agree" | "differs" | "llm_only" | "rules_only";
  evidenceVerified: boolean;
  detail?: string;
  /** When the engines differ on a number: the rule engine's reading. */
  rulesValue?: number;
}

/** Per-item trust signals (see reconcile.ts). */
export interface ParseChecks {
  items: ItemCheck[];
  suggestions: { item: ParsedItem; detail: string }[];
}

/** API envelope returned by POST /api/parse. */
export interface ParseResponse {
  result: ParsedFieldNote;
  /** Present when an LLM answered: cross-check against the rule engine. */
  checks?: ParseChecks;
  engine: ParseEngine;
  model?: string;
  /** Present when an LLM was configured but we fell back to the local parser. */
  fallbackReason?: string;
  latencyMs: number;
}

/**
 * Validate a payload *and* ground it in the actual schedule: an LLM can return
 * well-formed JSON that names a task that does not exist. Those items are moved
 * to `notes` instead of silently dropped.
 */
export function validateAgainstSchedule(
  raw: unknown,
  knownTaskIds: ReadonlySet<string>,
): { ok: true; value: ParsedFieldNote } | { ok: false; error: string } {
  const parsed = ParsedFieldNoteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const items: ParsedItem[] = [];
  const notes = [...parsed.data.notes];
  for (const item of parsed.data.items) {
    const ids = item.type === "dependency" ? [item.taskId, item.dependsOnTaskId] : [item.taskId];
    const unknown = ids.find((id) => !knownTaskIds.has(id));
    if (unknown) {
      notes.push({ text: item.evidence, kind: "unmatched", detail: `Refers to unknown task "${unknown}"` });
    } else if (item.type === "dependency" && item.taskId === item.dependsOnTaskId) {
      notes.push({ text: item.evidence, kind: "ambiguous", detail: "A task cannot depend on itself" });
    } else {
      items.push(item);
    }
  }
  return { ok: true, value: { ...parsed.data, items, notes } };
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}

export function toScheduleChange(item: ParsedItem): ScheduleChange {
  return item.type === "delay"
    ? { kind: "delay", taskId: item.taskId, days: item.delayDays, reason: item.reason, evidence: item.evidence }
    : { kind: "dependency", taskId: item.taskId, dependsOnTaskId: item.dependsOnTaskId, lagDays: item.lagDays, reason: item.reason, evidence: item.evidence };
}
