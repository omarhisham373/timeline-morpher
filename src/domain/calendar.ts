/** Working-day calendar (Mon–Fri). Pure, timezone-safe (all maths in UTC). */

const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Snap a date forward to the next working day (no-op for Mon–Fri). */
export function nextWorkday(d: Date): Date {
  let t = d.getTime();
  while (isWeekend(new Date(t))) t += DAY_MS;
  return new Date(t);
}

/**
 * Calendar date of working-day `offset` (fractional offsets are floored; a
 * half-day still lands on the same calendar day).
 */
export function workdayToDate(startIso: string, offset: number): Date {
  let d = nextWorkday(parseIsoDate(startIso));
  let remaining = Math.floor(Math.max(0, offset));
  while (remaining > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (!isWeekend(d)) remaining--;
  }
  return d;
}

/** Last working day a task occupies when it finishes at `finishOffset` (exclusive end). */
export function finishDate(startIso: string, finishOffset: number): Date {
  return workdayToDate(startIso, Math.max(0, Math.ceil(finishOffset) - 1));
}

const FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const FMT_WD = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

export const formatShort = (d: Date) => FMT.format(d);
export const formatWeekday = (d: Date) => FMT_WD.format(d);

/** "1 day", "2.5 days" */
export function pluralDays(n: number): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${v} ${Math.abs(n) === 1 ? "day" : "days"}`;
}
