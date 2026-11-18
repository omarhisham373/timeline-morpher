import { describe, expect, it } from "vitest";
import { finishDate, nextWorkday, parseIsoDate, pluralDays, toIsoDate, workdayToDate } from "@/domain/calendar";

describe("working-day calendar", () => {
  it("skips weekends", () => {
    // 2026-11-27 is a Friday
    expect(toIsoDate(workdayToDate("2026-11-23", 4))).toBe("2026-11-27");
    expect(toIsoDate(workdayToDate("2026-11-23", 5))).toBe("2026-11-30");
  });
  it("snaps a weekend start to Monday", () => {
    expect(toIsoDate(nextWorkday(parseIsoDate("2026-11-21")))).toBe("2026-11-23");
  });
  it("maps an exclusive finish offset to the last working day used", () => {
    expect(toIsoDate(finishDate("2026-11-23", 5))).toBe("2026-11-27");
    expect(toIsoDate(finishDate("2026-11-23", 4.5))).toBe("2026-11-27");
  });
  it("rejects malformed dates", () => {
    expect(() => parseIsoDate("23/11/2026")).toThrow();
  });
  it("pluralises", () => {
    expect(pluralDays(1)).toBe("1 day");
    expect(pluralDays(2.5)).toBe("2.5 days");
  });
});
