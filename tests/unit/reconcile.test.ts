import { describe, expect, it } from "vitest";
import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import { parseFieldNote } from "@/parsing/localParser";
import { evidenceInTranscript, reconcile } from "@/parsing/reconcile";
import type { ParsedFieldNote } from "@/parsing/schema";

const transcript = "Rebar delivery showed up late, we're two days behind on slab rebar. Electrical rough-in is three days behind. Plumbing can't start until the HVAC ductwork is in.";
const rules = parseFieldNote(transcript, SAMPLE_PROJECT);

// Shaped like the real output we got from a local 3B model during testing.
const llm: ParsedFieldNote = {
  summary: "x",
  notes: [],
  items: [
    { type: "delay", taskId: "rebar", delayDays: 2, reason: "", category: "materials", confidence: 0.9, evidence: "Rebar was late by 2 days", assumedDuration: false },
    { type: "delay", taskId: "slab", delayDays: 3, reason: "", category: "materials", confidence: 0.8, evidence: "Slab pour in Area B is gonna slip", assumedDuration: false },
    { type: "dependency", taskId: "plumbing", dependsOnTaskId: "hvac", lagDays: 3, reason: "", confidence: 0.8, evidence: "Plumbing can't start until the HVAC ductwork is in" },
  ],
};

describe("reconcile (LLM trust layer)", () => {
  const r = reconcile(transcript, llm, rules);

  it("swaps a paraphrased quote for the verbatim one when the rule engine agrees", () => {
    expect(r.checks[0]).toMatchObject({ agreement: "agree", evidenceVerified: true });
    expect(transcript).toContain(r.result.items[0].evidence);
    expect(r.result.items[0].confidence).toBe(0.9);
  });

  it("penalises an unverifiable, LLM-only claim", () => {
    expect(r.checks[1]).toMatchObject({ agreement: "llm_only", evidenceVerified: false });
    expect(r.result.items[1].confidence).toBeCloseTo(0.48);
  });

  it("flags disagreement on numbers", () => {
    expect(r.checks[2]).toMatchObject({ agreement: "differs", evidenceVerified: true });
    expect(r.checks[2].detail).toMatch(/0-day lag/);
  });

  it("offers what the LLM missed as suggestions", () => {
    expect(r.suggestions.map((s) => s.item.taskId)).toEqual(["electrical"]);
  });

  it("matches quotes regardless of case and punctuation", () => {
    expect(evidenceInTranscript("PLUMBING cant start until the hvac ductwork", transcript)).toBe(true);
    expect(evidenceInTranscript("", transcript)).toBe(false);
  });
});
