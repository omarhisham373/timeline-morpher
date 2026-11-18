import { applyChanges } from "@/domain/changes";
import type { Project } from "@/domain/types";
import { ParsedItemSchema, formatZodError, toScheduleChange, type ItemCheck, type ParsedItem, type ParseNote, type ParseResponse } from "@/parsing/schema";
import type { CaptureSource } from "@/offline/types";

export interface DraftItem {
  key: string;
  include: boolean;
  item: ParsedItem;
  /** Trust signal from the LLM ↔ rule-engine cross-check, when an LLM was used. */
  check?: ItemCheck;
}

export interface ReviewDraft {
  id: string;
  transcript: string;
  source: CaptureSource;
  response: ParseResponse;
  items: DraftItem[];
  notes: ParseNote[];
  outboxId?: string;
}

export function createDraft(id: string, transcript: string, source: CaptureSource, response: ParseResponse, outboxId?: string): ReviewDraft {
  return {
    id,
    transcript,
    source,
    response,
    outboxId,
    notes: response.result.notes,
    items: [
      ...response.result.items.map((item, i) => ({
        key: `${id}-${i}`,
        // Unverifiable quotes start unticked: a human has to opt in.
        include: response.checks?.items[i]?.evidenceVerified ?? true,
        item,
        check: response.checks?.items[i],
      })),
      ...(response.checks?.suggestions ?? []).map((s, i) => ({
        key: `${id}-s${i}`,
        include: false,
        item: s.item,
        check: { agreement: "rules_only" as const, evidenceVerified: true, detail: s.detail },
      })),
    ],
  };
}

/**
 * Why an item can't be applied right now (schema problem or schedule conflict),
 * or null when it's fine. Checked against the live project so it stays correct
 * after undo/redo or other notes being applied first.
 */
export function itemProblem(project: Project, item: ParsedItem): string | null {
  const parsed = ParsedItemSchema.safeParse(item);
  if (!parsed.success) return formatZodError(parsed.error);
  const res = applyChanges(project, [toScheduleChange(parsed.data)]);
  return res.rejected[0]?.reason ?? null;
}

export function includedChanges(project: Project, draft: ReviewDraft) {
  return draft.items.filter((d) => d.include && !itemProblem(project, d.item)).map((d) => toScheduleChange(d.item));
}
