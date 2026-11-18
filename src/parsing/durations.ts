/**
 * Pull a duration out of messy speech: "like two days", "a day and a half",
 * "48 hours", "another week", "lost the morning". Results are in working days.
 */

export interface DurationMatch {
  days: number;
  /** 0–1: "3 days" is certain, "a few days" is not. */
  certainty: number;
  start: number;
  end: number;
  text: string;
}

const WORD_NUMBERS: Record<string, { n: number; certainty: number }> = {
  a: { n: 1, certainty: 0.95 },
  an: { n: 1, certainty: 0.95 },
  another: { n: 1, certainty: 0.95 },
  one: { n: 1, certainty: 1 },
  two: { n: 2, certainty: 1 },
  three: { n: 3, certainty: 1 },
  four: { n: 4, certainty: 1 },
  five: { n: 5, certainty: 1 },
  six: { n: 6, certainty: 1 },
  seven: { n: 7, certainty: 1 },
  eight: { n: 8, certainty: 1 },
  nine: { n: 9, certainty: 1 },
  ten: { n: 10, certainty: 1 },
  eleven: { n: 11, certainty: 1 },
  twelve: { n: 12, certainty: 1 },
  fifteen: { n: 15, certainty: 1 },
  twenty: { n: 20, certainty: 1 },
  couple: { n: 2, certainty: 0.85 },
  few: { n: 3, certainty: 0.6 },
  several: { n: 3, certainty: 0.55 },
};

const QTY = `(\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join("|")})`;
const DURATION_RE = new RegExp(
  `\\b(?:a\\s+)?(?:another\\s+)?${QTY}(?:\\s+of)?(\\s+and\\s+a\\s+half)?\\s*` +
    `(?:more\\s+|extra\\s+|full\\s+|whole\\s+|working\\s+|work\\s+|business\\s+)?` +
    `(days?|workdays?|weeks?|hours?|hrs?)\\b(\\s+and\\s+a\\s+half)?`,
  "gi",
);
const HALF_DAY_RE = /\b(?:half\s+a\s+day|half[\s-]day|lost\s+the\s+(?:morning|afternoon))\b/gi;
const FULL_DAY_RE = /\b(?:rained\s+out|washed\s+out|lost\s+(?:the\s+)?(?:whole\s+)?(?:day|today))\b/gi;

export function extractDurations(text: string): DurationMatch[] {
  const lower = text.toLowerCase();
  const found: DurationMatch[] = [];
  for (const m of lower.matchAll(DURATION_RE)) {
    const qty = m[1];
    const numeric = /^\d/.test(qty);
    const word = WORD_NUMBERS[qty];
    let n = numeric ? Number(qty) : word.n;
    const certainty = numeric ? 1 : word.certainty;
    if (m[2] || m[4]) n += 0.5;
    const unit = m[3];
    let days: number;
    if (unit.startsWith("week")) days = n * 5;
    else if (unit.startsWith("h")) days = n >= 24 ? n / 24 : Math.max(0.5, Math.round((n / 8) * 2) / 2);
    else days = n;
    found.push({ days: round(days), certainty, start: m.index!, end: m.index! + m[0].length, text: text.slice(m.index!, m.index! + m[0].length) });
  }
  for (const m of lower.matchAll(HALF_DAY_RE)) pushIfFree(found, { days: 0.5, certainty: 0.8, start: m.index!, end: m.index! + m[0].length, text: m[0] });
  for (const m of lower.matchAll(FULL_DAY_RE)) pushIfFree(found, { days: 1, certainty: 0.75, start: m.index!, end: m.index! + m[0].length, text: m[0] });
  return found.sort((a, b) => a.start - b.start);
}

function pushIfFree(list: DurationMatch[], d: DurationMatch) {
  if (!list.some((x) => x.start < d.end && d.start < x.end)) list.push(d);
}

const round = (n: number) => Math.round(n * 100) / 100;
