/** Small text utilities shared by the local parser. Offsets always refer to the original string. */

export interface Token {
  /** Normalised form used for matching (lower-case, possessive stripped, light stemming). */
  norm: string;
  raw: string;
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  start: number;
  end: number;
}

const TOKEN_RE = /[a-z0-9]+(?:'[a-z]+)?/g;

export function normaliseQuotes(s: string): string {
  // Same length replacement keeps offsets valid.
  return s.replace(/[\u2018\u2019\u02bc]/g, "'");
}

export function stem(word: string): string {
  let w = word.replace(/'(s|re|ll|ve|d|m)$/, "");
  if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string, offset = 0): Token[] {
  const lower = normaliseQuotes(text).toLowerCase();
  const tokens: Token[] = [];
  for (const m of lower.matchAll(TOKEN_RE)) {
    tokens.push({ norm: stem(m[0]), raw: m[0], start: offset + m.index!, end: offset + m.index! + m[0].length });
  }
  return tokens;
}

/** Split into sentences, keeping offsets. */
export function splitSentences(text: string): Segment[] {
  return splitBy(text, /[.!?;\n]+/g, 0);
}

/**
 * Split a sentence into clauses at commas and discourse markers ("so", "but",
 * "because"). "and" is deliberately *not* a boundary: "plumbing and electrical
 * are two days behind" must stay one clause.
 */
export function splitClauses(sentence: Segment): Segment[] {
  return splitBy(sentence.text, /,|\s+(?=(?:so|but|because|cause|plus|then|also|oh)\b)/gi, sentence.start);
}

function splitBy(text: string, re: RegExp, base: number): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const push = (from: number, to: number) => {
    const slice = text.slice(from, to);
    const lead = slice.length - slice.trimStart().length;
    const trimmed = slice.trim();
    if (trimmed) out.push({ text: trimmed, start: base + from + lead, end: base + from + lead + trimmed.length });
  };
  for (const m of text.matchAll(re)) {
    push(last, m.index!);
    last = m.index! + m[0].length;
  }
  push(last, text.length);
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
