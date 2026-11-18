import type { Task, TaskId } from "@/domain/types";
import { levenshtein, stem, tokenize, type Token } from "./text";

export interface TaskMention {
  taskId: TaskId;
  /** Character offsets in the original text. */
  start: number;
  end: number;
  /** 0–1 match quality (exact phrase vs fuzzy STT-error match). */
  score: number;
  matched: string;
}

interface Phrase {
  taskId: TaskId;
  parts: string[];
  weight: number;
}

/** Words never matched fuzzily (too many everyday near-misses). */
const COMMON = new Set(["point", "still", "start", "think", "there", "their", "where", "about", "after", "today", "again", "these", "those", "check", "right", "front", "under", "other", "while", "which", "framed", "shower", "power", "floor", "really", "pretty"]);

/**
 * Finds task mentions in free text. Robust to the usual speech-to-text damage:
 * possessives ("roofing's"), plurals, split compounds ("dry wall", "h vac") and
 * single-letter typos ("electrial").
 */
export class TaskMatcher {
  private phrases: Phrase[];

  constructor(tasks: Task[]) {
    this.phrases = [];
    for (const t of tasks) {
      const sources: [string, number][] = [
        [t.name, 1],
        [t.id, 0.95],
        ...t.aliases.map((a): [string, number] => [a, 0.95]),
      ];
      const seen = new Set<string>();
      for (const [src, weight] of sources) {
        const parts = tokenize(src).map((tk) => tk.norm).filter((p) => p.length > 1 || /\d/.test(p));
        const key = parts.join(" ");
        if (!parts.length || seen.has(key)) continue;
        seen.add(key);
        this.phrases.push({ taskId: t.id, parts, weight });
      }
    }
  }

  find(text: string, offset = 0): TaskMention[] {
    const tokens = tokenize(text, offset);
    const candidates: (TaskMention & { len: number })[] = [];
    for (const p of this.phrases) {
      for (let i = 0; i < tokens.length; i++) {
        const m = this.matchAt(tokens, i, p);
        if (m) candidates.push({ taskId: p.taskId, start: tokens[i].start, end: tokens[i + m.consumed - 1].end, score: m.score * p.weight, matched: text.slice(tokens[i].start - offset, tokens[i + m.consumed - 1].end - offset), len: p.parts.length });
      }
    }
    // Longest, best phrase wins; mentions never overlap.
    candidates.sort((a, b) => b.len - a.len || b.score - a.score || a.start - b.start);
    const chosen: TaskMention[] = [];
    for (const c of candidates) {
      if (chosen.some((x) => x.start < c.end && c.start < x.end)) continue;
      chosen.push({ taskId: c.taskId, start: c.start, end: c.end, score: round(c.score), matched: c.matched });
    }
    return chosen.sort((a, b) => a.start - b.start);
  }

  private matchAt(tokens: Token[], i: number, p: Phrase): { consumed: number; score: number } | null {
    // Exact multi-token phrase.
    if (p.parts.every((part, k) => tokens[i + k]?.norm === part)) return { consumed: p.parts.length, score: 1 };
    if (p.parts.length === 1) {
      const target = p.parts[0];
      // Split compound: "dry wall" → drywall, "h vac" → hvac.
      const next = tokens[i + 1];
      if (next && stem(tokens[i].raw + next.raw) === target) return { consumed: 2, score: 0.9 };
      // Fuzzy single token for longer words only.
      const tok = tokens[i].norm;
      if (target.length >= 6 && !COMMON.has(tok) && tok[0] === target[0]) {
        const dist = levenshtein(tok, target);
        if (dist === 1 || (dist === 2 && target.length >= 9)) return { consumed: 1, score: dist === 1 ? 0.75 : 0.6 };
      }
    }
    return null;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
