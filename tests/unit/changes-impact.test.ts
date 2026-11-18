import { describe, expect, it } from "vitest";
import { applyChanges } from "@/domain/changes";
import { analyzeImpact } from "@/domain/impact";
import { suggestRecovery } from "@/domain/recovery";
import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import { project, task } from "./helpers";

describe("applyChanges", () => {
  it("applies delays and new links immutably", () => {
    const r = applyChanges(SAMPLE_PROJECT, [
      { kind: "delay", taskId: "rebar", days: 2, reason: "" },
      { kind: "dependency", taskId: "plumbing", dependsOnTaskId: "hvac", lagDays: 0, reason: "" },
    ]);
    expect(r.applied).toHaveLength(2);
    expect(r.project.tasks.find((t) => t.id === "rebar")!.delayDays).toBe(2);
    expect(SAMPLE_PROJECT.tasks.find((t) => t.id === "rebar")!.delayDays).toBe(0);
    expect(r.touched.sort()).toEqual(["plumbing", "rebar"]);
  });

  it("accumulates repeated delays on the same task", () => {
    const r = applyChanges(SAMPLE_PROJECT, [
      { kind: "delay", taskId: "rebar", days: 1, reason: "" },
      { kind: "delay", taskId: "rebar", days: 0.5, reason: "" },
    ]);
    expect(r.project.tasks.find((t) => t.id === "rebar")!.delayDays).toBe(1.5);
  });

  it.each([
    [{ kind: "delay", taskId: "nope", days: 1, reason: "" }, /Unknown task/],
    [{ kind: "delay", taskId: "rebar", days: 0, reason: "" }, /positive/],
    [{ kind: "delay", taskId: "rebar", days: Number.NaN, reason: "" }, /positive/],
    [{ kind: "delay", taskId: "rebar", days: 400, reason: "" }, /transcription error/],
    [{ kind: "dependency", taskId: "excavation", dependsOnTaskId: "finishes", lagDays: 0, reason: "" }, /circular/],
    [{ kind: "dependency", taskId: "drywall", dependsOnTaskId: "inspection", lagDays: 0, reason: "" }, /Already linked/],
    [{ kind: "dependency", taskId: "drywall", dependsOnTaskId: "ghost", lagDays: 0, reason: "" }, /Unknown task/],
    [{ kind: "dependency", taskId: "roofing", dependsOnTaskId: "hvac", lagDays: -1, reason: "" }, /Lag/],
  ] as const)("rejects invalid change %#", (change, reason) => {
    const r = applyChanges(SAMPLE_PROJECT, [change]);
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(reason);
  });

  it("validates later changes against earlier ones in the same batch", () => {
    const p = project([task("a", 1), task("b", 1)]);
    const r = applyChanges(p, [
      { kind: "dependency", taskId: "b", dependsOnTaskId: "a", lagDays: 0, reason: "" },
      { kind: "dependency", taskId: "a", dependsOnTaskId: "b", lagDays: 0, reason: "" },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/circular/);
  });
});

describe("analyzeImpact", () => {
  const sampleNote = applyChanges(SAMPLE_PROJECT, [
    { kind: "delay", taskId: "rebar", days: 2, reason: "" },
    { kind: "delay", taskId: "electrical", days: 3, reason: "" },
    { kind: "dependency", taskId: "plumbing", dependsOnTaskId: "hvac", lagDays: 0, reason: "" },
  ]);
  const report = analyzeImpact(SAMPLE_PROJECT, sampleNote.project, sampleNote.touched);

  it("moves the finish by the critical delays only", () => {
    expect(report.finishShift).toBe(5);
    expect(report.drivers.sort()).toEqual(["electrical", "rebar"]);
  });

  it("traces every pushed task back to its root cause", () => {
    expect(report.tasks.slab.kind).toBe("propagated");
    expect(report.tasks.slab.causeChain).toEqual(["rebar", "slab"]);
    expect(report.tasks.drywall.causeChain).toEqual(["electrical", "inspection", "drywall"]);
  });

  it("orders the ripple by graph distance", () => {
    expect(report.tasks.rebar.depth).toBe(0);
    expect(report.tasks.slab.depth).toBe(1);
    expect(report.tasks.framing.depth).toBe(2);
  });

  it("reports delays swallowed by float as absorbed", () => {
    const small = applyChanges(SAMPLE_PROJECT, [{ kind: "delay", taskId: "hvac", days: 1, reason: "" }]);
    const r = analyzeImpact(SAMPLE_PROJECT, small.project, small.touched);
    expect(r.finishShift).toBe(0);
    expect(r.tasks.hvac.kind).toBe("direct");
    expect(r.tasks.inspection.kind).toBe("unchanged");
    expect(r.drivers).toEqual([]);
  });
});

describe("suggestRecovery", () => {
  it("only proposes crashing work downstream of the delay and verifies the gain with CPM", () => {
    const delayed = applyChanges(SAMPLE_PROJECT, [{ kind: "delay", taskId: "rebar", days: 2, reason: "" }]).project;
    const options = suggestRecovery(delayed);
    expect(options.length).toBeGreaterThan(0);
    const ids = options.map((o) => o.taskId);
    expect(ids).not.toContain("excavation");
    expect(ids).not.toContain("footings");
    expect(options[0].recoveredDays).toBeGreaterThan(0);
    expect(options.every((o, i) => i === 0 || options[i - 1].recoveredDays >= o.recoveredDays)).toBe(true);
  });
  it("suggests nothing when there is no delay", () => {
    expect(suggestRecovery(SAMPLE_PROJECT)).toEqual([]);
  });
});
