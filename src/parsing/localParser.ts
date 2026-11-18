import type { Project, TaskId } from "@/domain/types";
import { extractDurations, type DurationMatch } from "./durations";
import type { DelayItem, DependencyItem, ParsedFieldNote, ParsedItem, ParseNote } from "./schema";
import { TaskMatcher, type TaskMention } from "./taskMatcher";
import { normaliseQuotes, splitClauses, splitSentences, type Segment } from "./text";

/**
 * Deterministic, offline field-note parser.
 *
 * It is the zero-cost default and the safety net when an LLM is unavailable,
 * slow, or returns something that fails validation. It is rule-based on
 * purpose: every decision can be explained to a superintendent, and every item
 * carries a confidence score and the exact words it came from.
 */

export const MAX_INPUT_CHARS = 5000;

const DELAY_CUE = /\b(late|delay(?:ed|s)?|behind|slip(?:s|ped|ping)?|push(?:ed|es|ing)?|held up|holding up|stuck|lost|rain(?:ed|ing)?|washed out|no[- ]show|didn'?t show|did not show|didn'?t come|never showed|short[- ]?(?:handed|staffed)|back[- ]?order(?:ed)?|broke(?: down)?|failed|missed|another|extra|longer|overrun)\b/i;
const ON_TRACK = /\b(on track|on schedule|on time|no delays?|not delayed|isn'?t delayed|no issues?|no problems?|fine|good to go|all good|ahead(?: of schedule)?)\b/i;
const CONSEQUENCE = /\b(with it|as well|too|knock[- ]on|because of (?:that|it|this)|as a result|domino)\b/i;
const HEDGE = /\b(maybe|might|probably|possibly|could be|like|about|around|roughly|ish|i think|guess)\b/i;
const PRONOUN = /\b(it|that|this|they|them|those)\b/i;
const REASON_LEAD = /^(they'?re|it'?s|because|cause|since|due to|we'?re|there'?s)\b/i;

// "A ... can't start until B", "A is waiting on B", "A depends on B", "A needs B done"
const A_AFTER_B = /\b(?:can'?t|cannot|can not|won'?t|couldn'?t|not able to|unable to)\s+(?:even\s+)?(?:start|begin|go|proceed|move|happen|kick off|get going)\b.*\b(?:until|till|til|before|without)\b|\bwait(?:s|ing)?\s+(?:on|for)\b|\b(?:depends|depending|dependent|relies|relying)\s+on\b|\bblocked\s+by\b|\bneeds?\b|\bafter\b|\bbehind\b/i;
// "B has to be done before A", "B needs to go in first, then A"
const B_BEFORE_A = /\b(?:has to|have to|needs? to|must|gotta|got to|should)\b.*\b(?:before|first|ahead of)\b/i;

const CATEGORIES: [DelayItem["category"], RegExp][] = [
  ["weather", /\b(rain|rained|raining|wind|windy|snow|storm|weather|cold|heat|mud|muddy|washed out)\b/i],
  ["materials", /\b(deliver(?:y|ed|ies)?|material|materials|supplier|shipment|back[- ]?order(?:ed)?|truck|didn'?t arrive|showed up late)\b/i],
  ["labor", /\b(crew|didn'?t show|no[- ]show|never showed|short[- ]?(?:handed|staffed)|sick|manpower|guys)\b/i],
  ["inspection", /\b(inspector|inspection|permit|sign[- ]?off|failed)\b/i],
  ["equipment", /\b(crane|pump|equipment|broke(?: down)?|machine|lift|generator)\b/i],
  ["design", /\b(rfi|drawings?|change order|architect|engineer|redesign|clash)\b/i],
];

interface Clause extends Segment {
  mentions: TaskMention[];
  durations: (DurationMatch & { absStart: number })[];
}

export function parseFieldNote(transcript: string, project: Project): ParsedFieldNote {
  const notes: ParseNote[] = [];
  let text = normaliseQuotes(transcript ?? "");
  if (text.length > MAX_INPUT_CHARS) {
    notes.push({ text: text.slice(MAX_INPUT_CHARS, MAX_INPUT_CHARS + 120), kind: "unmatched", detail: `Only the first ${MAX_INPUT_CHARS} characters were parsed` });
    text = text.slice(0, MAX_INPUT_CHARS);
  }
  if (!text.trim()) return { summary: "Nothing to parse yet — record or type a field note.", items: [], notes };

  const matcher = new TaskMatcher(project.tasks);
  const ancestors = ancestorMap(project);
  const name = (id: TaskId) => project.tasks.find((t) => t.id === id)?.name ?? id;

  const delays = new Map<TaskId, DelayItem>();
  const dependencies: DependencyItem[] = [];
  const pendingConsequences: { taskId: TaskId; note: ParseNote }[] = [];
  let lastTask: TaskId | null = null;
  let lastItem: ParsedItem | null = null;

  for (const sentence of splitSentences(text)) {
    for (const seg of splitClauses(sentence)) {
      const clause: Clause = {
        ...seg,
        mentions: matcher.find(seg.text, seg.start),
        durations: extractDurations(seg.text).map((d) => ({ ...d, absStart: seg.start + d.start })),
      };
      const lower = clause.text.toLowerCase();
      const hedge = HEDGE.test(lower) ? 0.85 : 1;

      // 1. Dependencies need two distinct tasks in the same clause.
      const distinct = uniqueTasks(clause.mentions);
      if (distinct.length >= 2) {
        const dep = detectDependency(clause, distinct, hedge);
        if (dep) {
          dependencies.push(dep);
          lastTask = dep.taskId;
          lastItem = dep;
          continue;
        }
      }

      // 2. Resolve who the clause is about (explicit mention or pronoun carry-over).
      let subjects = distinct.map((m) => m.taskId);
      let carried = false;
      if (!subjects.length && lastTask && PRONOUN.test(lower) && (clause.durations.length || DELAY_CUE.test(lower))) {
        subjects = [lastTask];
        carried = true;
      }

      if (!subjects.length) {
        if (lastItem && REASON_LEAD.test(clause.text) && !clause.durations.length) {
          lastItem.reason = joinReason(lastItem.reason, clause.text);
        } else if (clause.durations.length || DELAY_CUE.test(lower)) {
          if (!ON_TRACK.test(lower)) notes.push({ text: clause.text, kind: "unmatched", detail: "Sounds like a delay, but no scheduled task was recognised" });
        }
        continue;
      }
      lastTask = subjects[subjects.length - 1];

      // 3. Explicitly on track.
      if (ON_TRACK.test(lower) && !clause.durations.length && !/\b(late|behind|delayed)\b/i.test(lower.replace(ON_TRACK, ""))) {
        for (const id of subjects) notes.push({ text: clause.text, kind: "on_track", detail: `${name(id)} reported on track` });
        continue;
      }

      const hasCue = DELAY_CUE.test(lower);
      if (!clause.durations.length && !hasCue) continue;

      const matchScore = (id: TaskId) =>
        (carried ? 0.8 : 1) * Math.max(...clause.mentions.filter((m) => m.taskId === id).map((m) => m.score), carried ? 1 : 0);

      // 4. Delay with an explicit duration: pair durations with tasks in order.
      if (clause.durations.length) {
        subjects.forEach((id, i) => {
          const d = clause.durations[Math.min(i, clause.durations.length - 1)];
          const confidence = clamp(matchScore(id) * d.certainty * (hasCue ? 1 : 0.8) * hedge);
          upsertDelay(delays, {
            type: "delay",
            taskId: id,
            delayDays: d.days,
            reason: reasonFrom(clause.text),
            category: categorize(sentence.text),
            confidence,
            evidence: clause.text,
            assumedDuration: false,
          }, notes);
          lastItem = delays.get(id)!;
        });
        continue;
      }

      // 5. Delay cue without a duration: a knock-on effect, or a delay we have to size.
      for (const id of subjects) {
        if (CONSEQUENCE.test(lower)) {
          pendingConsequences.push({
            taskId: id,
            note: { text: clause.text, kind: "consequence", detail: `${name(id)} will move automatically through its dependencies` },
          });
          continue;
        }
        if (!delays.has(id)) {
          delays.set(id, {
            type: "delay",
            taskId: id,
            delayDays: 1,
            reason: reasonFrom(clause.text),
            category: categorize(sentence.text),
            confidence: clamp(matchScore(id) * 0.35 * hedge),
            evidence: clause.text,
            assumedDuration: true,
          });
          lastItem = delays.get(id)!;
        }
      }
    }
  }

  // A "consequence" is only a consequence if something upstream actually slipped;
  // otherwise it's a delay we must not lose.
  for (const { taskId, note } of pendingConsequences) {
    const upstreamDelayed = [...delays.keys()].some((d) => ancestors.get(taskId)?.has(d));
    if (upstreamDelayed || delays.has(taskId)) notes.push(note);
    else
      delays.set(taskId, {
        type: "delay",
        taskId,
        delayDays: 1,
        reason: reasonFrom(note.text),
        category: categorize(note.text),
        confidence: 0.3,
        evidence: note.text,
        assumedDuration: true,
      });
  }

  const items: ParsedItem[] = [...delays.values(), ...dedupeDependencies(dependencies)];
  return { summary: summarize(items, notes, name), items, notes };
}

function detectDependency(clause: Clause, mentions: TaskMention[], hedge: number): DependencyItem | null {
  const [a, b] = mentions;
  const between = clause.text.slice(a.end - clause.start, b.start - clause.start).toLowerCase();
  const tail = clause.text.slice(b.end - clause.start).toLowerCase();
  let taskId: TaskId | null = null;
  let dependsOn: TaskId | null = null;
  if (B_BEFORE_A.test(between)) {
    taskId = b.taskId;
    dependsOn = a.taskId;
  } else if (A_AFTER_B.test(between)) {
    taskId = a.taskId;
    dependsOn = b.taskId;
  } else if (/\b(?:first|before)\b/.test(tail) && /\b(?:need|needs|has to|have to|gotta)\b/.test(clause.text.slice(0, a.start - clause.start).toLowerCase())) {
    // "need the inspection before drywall" → drywall depends on inspection
    taskId = b.taskId;
    dependsOn = a.taskId;
  }
  if (!taskId || !dependsOn) return null;
  // A duration inside the clause is a lag: "framing two days after the pour".
  const lag = clause.durations.find((d) => d.absStart > a.end && d.absStart < b.start)?.days ?? 0;
  return {
    type: "dependency",
    taskId,
    dependsOnTaskId: dependsOn,
    lagDays: lag,
    reason: reasonFrom(clause.text),
    confidence: clamp(0.9 * Math.min(a.score, b.score) * hedge),
    evidence: clause.text,
  };
}

function upsertDelay(map: Map<TaskId, DelayItem>, item: DelayItem, notes: ParseNote[]) {
  const existing = map.get(item.taskId);
  if (existing && !existing.assumedDuration && existing.delayDays !== item.delayDays) {
    // A later explicit figure is treated as a correction ("actually make that three").
    notes.push({ text: existing.evidence, kind: "ambiguous", detail: `Superseded by a later figure for the same task (${existing.delayDays} → ${item.delayDays} days)` });
    item = { ...item, confidence: clamp(item.confidence * 0.9) };
  }
  if (existing) item = { ...item, reason: existing.assumedDuration ? joinReason(existing.reason, item.reason) : item.reason, category: existing.category !== "other" ? existing.category : item.category };
  map.set(item.taskId, item);
}

function dedupeDependencies(list: DependencyItem[]): DependencyItem[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = `${d.taskId}<-${d.dependsOnTaskId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTasks(mentions: TaskMention[]): TaskMention[] {
  const seen = new Set<TaskId>();
  return mentions.filter((m) => (seen.has(m.taskId) ? false : (seen.add(m.taskId), true)));
}

function ancestorMap(project: Project): Map<TaskId, Set<TaskId>> {
  const byId = new Map(project.tasks.map((t) => [t.id, t]));
  const memo = new Map<TaskId, Set<TaskId>>();
  const visit = (id: TaskId, stack: Set<TaskId>): Set<TaskId> => {
    if (memo.has(id)) return memo.get(id)!;
    const out = new Set<TaskId>();
    if (stack.has(id)) return out; // defensive: cycles are rejected elsewhere
    stack.add(id);
    for (const d of byId.get(id)?.dependsOn ?? []) {
      out.add(d.taskId);
      visit(d.taskId, stack).forEach((x) => out.add(x));
    }
    stack.delete(id);
    memo.set(id, out);
    return out;
  };
  project.tasks.forEach((t) => visit(t.id, new Set()));
  return memo;
}

function categorize(text: string): DelayItem["category"] {
  return CATEGORIES.find(([, re]) => re.test(text))?.[0] ?? "other";
}

function reasonFrom(text: string): string {
  const cleaned = text.replace(/^(?:uh+|um+|so|oh|and|also|plus|then)[,\s]+/gi, "").replace(/\b(?:uh+|um+)\b,?\s*/gi, "").trim();
  const s = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

function joinReason(a: string, b: string): string {
  const next = reasonFrom(b);
  if (!a) return next;
  return `${a} — ${next.charAt(0).toLowerCase()}${next.slice(1)}`.slice(0, 200);
}

function summarize(items: ParsedItem[], notes: ParseNote[], name: (id: TaskId) => string): string {
  const delays = items.filter((i): i is DelayItem => i.type === "delay");
  const deps = items.filter((i) => i.type === "dependency").length;
  if (!items.length) {
    return notes.some((n) => n.kind === "unmatched")
      ? "Heard a possible delay but couldn't map it to a scheduled task — check the notes below."
      : "No schedule changes detected in this note.";
  }
  const parts: string[] = [];
  if (delays.length) {
    const total = delays.reduce((s, d) => s + d.delayDays, 0);
    parts.push(`${delays.length} delay${delays.length > 1 ? "s" : ""} (${delays.map((d) => `${name(d.taskId)} +${d.delayDays}d`).join(", ")}; ${total} task-days)`);
  }
  if (deps) parts.push(`${deps} new dependenc${deps > 1 ? "ies" : "y"}`);
  return parts.join(" · ");
}

const clamp = (n: number) => Math.round(Math.min(0.99, Math.max(0.05, n)) * 100) / 100;
