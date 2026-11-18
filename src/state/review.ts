import { applyChanges } from "@/domain/changes";
import type { Project } from "@/domain/types";
import { ParsedItemSchema, formatZodError, toScheduleChange, type ParsedItem, type ParseNote, type ParseResponse } from "@/parsing/schema";
import type { CaptureSource } from "@/offline/types";

export interface DraftItem {
  key: string;
  include: boolean;
  item: ParsedItem;
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
    items: response.result.items.map((item, i) => ({ key: `${id}-${i}`, include: true, item })),
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
