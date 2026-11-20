import type { Assignment, ItemGrade } from '../types';

/**
 * One plain JSON Schema per assignment, used on both sides of the hybrid call:
 * `onDeviceParams.promptOptions.responseConstraint` (Gemini Nano) and
 * `inCloudParams.generationConfig.responseJsonSchema` (cloud Gemini).
 * Kept to keywords both support: type, properties, required, enum, items.
 *
 * Field order is deliberate. The model writes JSON top to bottom, so it must first copy the
 * line it is judging (evidence), then decide whether that line meets the criteria (verdict),
 * and only then explain and score. Small models like Gemini Nano misread code far less this way.
 */
export const VERDICTS = ['full', 'partial', 'none'] as const;
export type Verdict = (typeof VERDICTS)[number];

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    evidence: { type: 'string' },
    verdict: { type: 'string', enum: [...VERDICTS] },
    why: { type: 'string' },
    score: { type: 'number' },
  },
  required: ['evidence', 'verdict', 'why', 'score'],
};

/**
 * `items` is an object with one required key per rubric item, not an array: with an array,
 * Gemini Nano sometimes stopped after the first item. Required keys force an answer for every item.
 */
export function gradeSchema(a: Assignment): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'object',
        properties: Object.fromEntries(a.rubric.map((r) => [r.id, ITEM_SCHEMA])),
        required: a.rubric.map((r) => r.id),
      },
      misconception: { type: 'string' },
      summary: { type: 'string' },
    },
    required: ['items', 'misconception', 'summary'],
  };
}

/** Make-up question plus criteria rewritten for it, one required key per rubric id. */
export function makeupSchema(a: Assignment): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      question: { type: 'string' },
      criteria: {
        type: 'object',
        properties: Object.fromEntries(a.rubric.map((r) => [r.id, { type: 'string' }])),
        required: a.rubric.map((r) => r.id),
      },
    },
    required: ['question', 'criteria'],
  };
}

export interface ParsedMakeup {
  question: string;
  criteria: Record<string, string>;
}

export function normalizeMakeup(raw: unknown, a: Assignment): ParsedMakeup {
  const obj = (raw ?? {}) as { question?: unknown; criteria?: Record<string, unknown> };
  const question = clip(obj.question, 1200);
  if (!question) throw new Error('The model did not write a question. Try again.');
  const criteria = Object.fromEntries(
    a.rubric.map((r) => [r.id, clip(obj.criteria?.[r.id], 300) || r.criteria]),
  );
  return { question, criteria };
}

export interface ParsedGrade {
  items: ItemGrade[];
  misconception: string;
  summary: string;
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

/**
 * Makes the score agree with the verdict the model reached right after quoting the evidence.
 * Small models often write a correct verdict and then a contradicting number.
 */
function scoreFromVerdict(verdict: unknown, score: number, points: number): number {
  if (verdict === 'full') return points;
  if (verdict === 'none') return 0;
  if (verdict === 'partial') return score > 0 && score < points ? score : points / 2;
  return score;
}

/** Validates model output against the rubric: clamps scores, fills missing items, drops unknown ids. */
export function normalizeGrade(raw: unknown, a: Assignment): ParsedGrade {
  const obj = (raw ?? {}) as { items?: unknown; misconception?: unknown; summary?: unknown };
  // Current schema: items keyed by rubric id. Older shape: an array of { id, ... }.
  const keyed = obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items) ? (obj.items as Record<string, Record<string, unknown>>) : null;
  const list = Array.isArray(obj.items) ? (obj.items as Record<string, unknown>[]) : [];
  const items: ItemGrade[] = a.rubric.map((r) => {
    const hit = keyed ? keyed[r.id] : list.find((x) => x && x.id === r.id);
    let score = Number(hit?.score);
    if (!Number.isFinite(score)) score = 0;
    score = scoreFromVerdict(hit?.verdict, score, r.points);
    score = Math.round(Math.min(r.points, Math.max(0, score)) * 2) / 2;
    return { itemId: r.id, score, why: clip(hit?.why, 300) || 'No comment from the model; please review.' };
  });
  return {
    items,
    misconception: clip(obj.misconception, 300) || 'None',
    summary: clip(obj.summary, 300),
  };
}
