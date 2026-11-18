import { describe, expect, it } from "vitest";
import { computeSchedule } from "@/domain/cpm";
import { CycleError, UnknownTaskError, topoSort, wouldCreateCycle } from "@/domain/graph";
import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import { project, task } from "./helpers";

describe("computeSchedule (CPM)", () => {
  it("computes early/late dates, float and the critical path of the sample job", () => {
    const s = computeSchedule(SAMPLE_PROJECT);
    expect(s.finish).toBe(26);
    expect(s.criticalPath).toEqual(["excavation", "footings", "rebar", "slab", "framing", "plumbing", "inspection", "drywall", "finishes"]);
    expect(s.tasks.roofing.slack).toBe(1);
    expect(s.tasks.hvac.slack).toBe(1);
    expect(s.tasks.electrical.critical).toBe(true);
    expect(s.tasks.framing.es).toBe(10); // slab finishes day 9 + 1 day curing lag
  });

  it("treats field delays as extra duration and shifts successors", () => {
    const p = project([task("a", 2, [], { delayDays: 1.5 }), task("b", 1, ["a"])]);
    const s = computeSchedule(p);
    expect(s.tasks.a.ef).toBe(3.5);
    expect(s.tasks.b.es).toBe(3.5);
    expect(s.finish).toBe(4.5);
  });

  it("respects lags and picks the latest predecessor as the driver", () => {
    const p = project([task("a", 2), task("b", 4), task("c", 1, [["a", 3], "b"])]);
    const s = computeSchedule(p);
    expect(s.tasks.c.es).toBe(5);
    expect(s.tasks.c.drivingPredecessor).toBe("a");
    expect(s.tasks.b.slack).toBe(1);
  });

  it("handles parallel independent chains", () => {
    const s = computeSchedule(project([task("a", 3), task("b", 5)]));
    expect(s.finish).toBe(5);
    expect(s.tasks.a.slack).toBe(2);
    expect(s.criticalPath).toEqual(["b"]);
  });

  it("rejects cycles with the offending loop", () => {
    const p = project([task("a", 1, ["c"]), task("b", 1, ["a"]), task("c", 1, ["b"])]);
    expect(() => computeSchedule(p)).toThrow(CycleError);
    try {
      topoSort(p.tasks);
    } catch (e) {
      expect((e as CycleError).cycle.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects dangling dependencies", () => {
    expect(() => computeSchedule(project([task("a", 1, ["ghost"])]))).toThrow(UnknownTaskError);
  });

  it("detects would-be cycles before they are created", () => {
    const tasks = project([task("a", 1), task("b", 1, ["a"]), task("c", 1, ["b"])]).tasks;
    expect(wouldCreateCycle(tasks, "a", "c")).toBe(true);
    expect(wouldCreateCycle(tasks, "c", "a")).toBe(false);
    expect(wouldCreateCycle(tasks, "a", "a")).toBe(true);
  });
});
