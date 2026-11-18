import { describe, expect, it } from "vitest";
import { barStatus, baselineImpact, sourcesFor } from "@/components/timeline/model";
import { applyChanges } from "@/domain/changes";
import { computeSchedule } from "@/domain/cpm";
import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import type { ActivityEntry } from "@/state/scheduleReducer";

const name = (id: string) => SAMPLE_PROJECT.tasks.find((t) => t.id === id)?.name ?? id;

describe("timeline model", () => {
  const { project } = applyChanges(SAMPLE_PROJECT, [{ kind: "delay", taskId: "rebar", days: 2, reason: "late", evidence: "rebar is two days behind" }]);
  const base = computeSchedule(SAMPLE_PROJECT);
  const now = computeSchedule(project);

  it("colours the reported task red and its successors as pushed", () => {
    expect(barStatus(project, now, base, "rebar")).toBe("delayed");
    expect(barStatus(project, now, base, "finishes")).toBe("pushed");
    expect(barStatus(project, now, base, "excavation")).toBe("on-plan");
  });

  it("traces a pushed task back to the root cause", () => {
    const impact = baselineImpact(SAMPLE_PROJECT, project).tasks.inspection;
    expect(impact.kind).toBe("propagated");
    expect(impact.causeChain[0]).toBe("rebar");
  });

  it("finds the field-note quotes behind a task, newest first", () => {
    const entry = (at: number, changes: ActivityEntry["changes"]): ActivityEntry => ({ id: String(at), at, title: "", source: "typed", changes, rejected: [], finishShift: 0, evidence: [] });
    const activity = [
      entry(2, [{ kind: "dependency", taskId: "plumbing", dependsOnTaskId: "hvac", lagDays: 0, reason: "", evidence: "plumbing can't start until the HVAC is in" }]),
      entry(1, [{ kind: "delay", taskId: "rebar", days: 2, reason: "", evidence: "rebar is two days behind" }]),
    ];
    expect(sourcesFor("rebar", activity, name)).toEqual([{ at: 1, label: "+2d", quote: "rebar is two days behind" }]);
    expect(sourcesFor("plumbing", activity, name)[0].label).toBe("now waits on HVAC ductwork");
    expect(sourcesFor("drywall", activity, name)).toEqual([]);
  });
});
