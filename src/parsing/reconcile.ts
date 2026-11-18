import type { ItemCheck, ParsedFieldNote, ParsedItem } from "./schema";

/**
 * Trust layer for LLM output. Two independent checks, both cheap and local:
 *
 * 1. **Evidence verification** – every item must quote the transcript. A quote
 *    that can't be found (after normalising case/punctuation) is a classic
 *    hallucination signal, so its confidence is cut and the item is flagged.
 * 2. **Cross-check** – the deterministic parser reads the same note. Where the
 *    two engines agree, the reviewer can skim; where they disagree, the UI says
 *    exactly how. Items only the rule engine found are offered as unticked
 *    suggestions instead of being silently lost.
 */

export type Agreement = ItemCheck["agreement"];
export type { ItemCheck };

export interface ReconciledNote {
  result: ParsedFieldNote;
  /** Parallel to result.items. */
  checks: ItemCheck[];
  /** Rule-engine items the LLM missed (offered unticked). */
  suggestions: { item: ParsedItem; check: ItemCheck }[];
}

const HALLUCINATION_PENALTY = 0.6;

export function normaliseForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function evidenceInTranscript(evidence: string, transcript: string): boolean {
  const e = normaliseForQuote(evidence);
  return e.length > 0 && normaliseForQuote(transcript).includes(e);
}

const sameTarget = (a: ParsedItem, b: ParsedItem) =>
  a.type === b.type && a.taskId === b.taskId && (a.type !== "dependency" || (b.type === "dependency" && a.dependsOnTaskId === b.dependsOnTaskId));

function compare(llm: ParsedItem, rules: ParsedItem | undefined): Pick<ItemCheck, "agreement" | "detail" | "rulesValue"> {
  if (!rules) return { agreement: "llm_only", detail: "Only the LLM found this — check the quote" };
  if (llm.type === "delay" && rules.type === "delay" && llm.delayDays !== rules.delayDays)
    return { agreement: "differs", detail: `Rule engine read ${rules.delayDays} day${rules.delayDays === 1 ? "" : "s"}`, rulesValue: rules.delayDays };
  if (llm.type === "dependency" && rules.type === "dependency" && llm.lagDays !== rules.lagDays)
    return { agreement: "differs", detail: `Rule engine read a ${rules.lagDays}-day lag`, rulesValue: rules.lagDays };
  return { agreement: "agree", detail: "Both engines agree" };
}

export function reconcile(transcript: string, llm: ParsedFieldNote, rules: ParsedFieldNote): ReconciledNote {
  const checks: ItemCheck[] = [];
  const items = llm.items.map((item) => {
    const match = rules.items.find((r) => sameTarget(item, r));
    const cmp = compare(item, match);
    if (evidenceInTranscript(item.evidence, transcript)) {
      checks.push({ ...cmp, evidenceVerified: true });
      return item;
    }
    if (match) {
      // The LLM paraphrased, but the rule engine independently found the same
      // change with a verbatim quote: keep the item, cite the real words.
      checks.push({ ...cmp, evidenceVerified: true, detail: `${cmp.detail} · quote taken from the transcript (LLM paraphrased)` });
      return { ...item, evidence: match.evidence };
    }
    checks.push({ ...cmp, evidenceVerified: false, detail: `Quote not found in the transcript · ${cmp.detail}` });
    return { ...item, confidence: Math.round(item.confidence * HALLUCINATION_PENALTY * 100) / 100 };
  });
  const suggestions = rules.items
    .filter((r) => !llm.items.some((l) => sameTarget(l, r)))
    .map((item) => ({ item, check: { agreement: "rules_only" as const, evidenceVerified: true, detail: "The LLM missed this; the rule engine heard it" } }));
  return { result: { ...llm, items }, checks, suggestions };
}
