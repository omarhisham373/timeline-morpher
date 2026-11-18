import { describe, expect, it } from "vitest";
import { POST as parseRoute } from "@/app/api/parse/route";
import { POST as transcribeRoute } from "@/app/api/transcribe/route";
import { SAMPLE_PROJECT } from "@/domain/sampleProject";
import { HISTORY_LIMIT, initialScheduleState, scheduleReducer, type ScheduleAction } from "@/state/scheduleReducer";

const apply = (taskId: string, days = 1): ScheduleAction => ({ type: "apply", id: `a-${taskId}-${days}`, at: 0, title: "t", source: "typed", changes: [{ kind: "delay", taskId, days, reason: "" }], evidence: [] });

describe("scheduleReducer", () => {
  it("applies, undoes and redoes", () => {
    let s = initialScheduleState(SAMPLE_PROJECT);
    s = scheduleReducer(s, apply("rebar", 2));
    expect(s.impact!.finishShift).toBe(2);
    expect(s.activity).toHaveLength(1);
    s = scheduleReducer(s, { type: "undo" });
    expect(s.project).toBe(SAMPLE_PROJECT);
    expect(s.activity).toHaveLength(0);
    s = scheduleReducer(s, { type: "redo" });
    expect(s.project.tasks.find((t) => t.id === "rebar")!.delayDays).toBe(2);
  });

  it("does not record history for a batch where everything was rejected", () => {
    const s0 = initialScheduleState(SAMPLE_PROJECT);
    const s = scheduleReducer(s0, apply("ghost"));
    expect(s.past).toHaveLength(0);
    expect(s.lastRejected[0].reason).toMatch(/Unknown/);
  });

  it("clears redo on a new change and caps history", () => {
    let s = initialScheduleState(SAMPLE_PROJECT);
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = scheduleReducer(s, apply("hvac", 0.5));
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    s = scheduleReducer(s, { type: "undo" });
    s = scheduleReducer(s, apply("rebar"));
    expect(s.future).toHaveLength(0);
  });

  it("undo / redo on empty stacks is a no-op", () => {
    const s = initialScheduleState(SAMPLE_PROJECT);
    expect(scheduleReducer(s, { type: "undo" })).toBe(s);
    expect(scheduleReducer(s, { type: "redo" })).toBe(s);
  });
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api/parse", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/parse", () => {
  it("parses a note against the provided project", async () => {
    const res = await parseRoute(post({ transcript: "Drywall is two days behind", project: SAMPLE_PROJECT }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engine).toBe("local");
    expect(body.result.items[0]).toMatchObject({ taskId: "drywall", delayDays: 2 });
  });
  it("rejects malformed JSON and invalid shapes", async () => {
    expect((await parseRoute(post("{nope"))).status).toBe(400);
    expect((await parseRoute(post({ transcript: 3 }))).status).toBe(422);
  });
  it("rejects a cyclic project", async () => {
    const cyclic = { ...SAMPLE_PROJECT, tasks: SAMPLE_PROJECT.tasks.map((t) => (t.id === "excavation" ? { ...t, dependsOn: [{ taskId: "finishes", lagDays: 0 }] } : t)) };
    const res = await parseRoute(post({ transcript: "x", project: cyclic }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/cycle/i);
  });
  it("replays idempotent retries", async () => {
    const key = { "Idempotency-Key": "abc-123" };
    const first = await (await parseRoute(post({ transcript: "Paint is one day behind", project: SAMPLE_PROJECT }, key))).json();
    const again = await parseRoute(post({ transcript: "different text", project: SAMPLE_PROJECT }, key));
    expect(again.headers.get("x-idempotent-replay")).toBe("true");
    expect(await again.json()).toEqual(first);
  });
});

describe("POST /api/transcribe", () => {
  it("answers 501 when no STT provider is configured", async () => {
    const res = await transcribeRoute(new Request("http://x/api/transcribe", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(501);
  });
});
