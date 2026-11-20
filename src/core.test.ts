import { describe, expect, it } from 'vitest';
import { pseudonymize, reidentify } from './privacy/pseudonym';
import { normalizeGrade, extractJson, gradeSchema } from './ai/schema';
import { insightsPayload, makeupPrompt } from './ai/prompts';
import { checkIns, finalScore, makeupAssignment, needsCheckIn } from './makeup';
import { skillMap, studentsToTalkTo } from './skills';
import { DEMO_ASSIGNMENTS, DEMO_STUDENTS } from './data/demo';
import type { Grade } from './types';

const a = DEMO_ASSIGNMENTS[0];
const roster = DEMO_STUDENTS;

function grade(studentId: string, scores: Record<string, number>, misconception = 'None'): Grade {
  return {
    submissionId: `${a.id}-${studentId}`, assignmentId: a.id, studentId,
    items: a.rubric.map((r) => ({ itemId: r.id, score: scores[r.id] ?? r.points, why: '' })),
    misconception, summary: '', status: 'suggested', ranOn: 'on_device', lane: 'private', ms: 1, gradedAt: 0,
  };
}

describe('pseudonymize', () => {
  it('replaces full names, first names, emails and IDs', () => {
    const text = 'Wei Chen (chen.we@example.edu, ID 001234567) said Wei forgot the base case; other@x.org too.';
    const out = pseudonymize(text, roster).text;
    expect(out).not.toMatch(/Wei|Chen|chen\.we|001234567|other@x\.org/);
    expect(out).toContain('Student 03');
    expect(out).toContain('[id]');
    expect(out).toContain('[email]');
  });
  it('does not touch code that merely contains a name inside a word', () => {
    expect(pseudonymize('weight = 3', roster).text).toBe('weight = 3');
  });
  it('round-trips aliases back to first names locally', () => {
    expect(reidentify('Good job, Student 03.', roster)).toBe('Good job, Wei.');
    expect(reidentify('Student 01 and Student 10', roster)).toBe('Aarav and Student 10');
  });
});

describe('normalizeGrade', () => {
  it('clamps scores, fills missing items and drops unknown ids', () => {
    const raw = extractJson('```json\n{"items":[{"id":"base","score":9,"why":"ok"},{"id":"zzz","score":1,"why":"x"},{"id":"step","score":1.26,"why":"half"}],"misconception":"m","summary":"s"}\n```');
    const g = normalizeGrade(raw, a);
    expect(g.items.map((i) => i.itemId)).toEqual(['base', 'step', 'edge', 'complexity']);
    expect(g.items[0].score).toBe(3);
    expect(g.items[1].score).toBe(1.5);
    expect(g.items[2].score).toBe(0);
  });
  it('makes the score follow the verdict when the model contradicts itself', () => {
    const g = normalizeGrade({ items: [
      { id: 'base', verdict: 'none', score: 3 },
      { id: 'step', verdict: 'full', score: 0 },
      { id: 'edge', verdict: 'partial', score: 0 },
      { id: 'complexity', verdict: 'partial', score: 0.5 },
    ] }, a);
    expect(g.items.map((i) => i.score)).toEqual([0, 3, 1, 0.5]);
  });
  it('requires every rubric item, each with evidence and a verdict before the score', () => {
    type Item = { properties: Record<string, unknown> };
    const s = gradeSchema(a) as { properties: { items: { required: string[]; properties: Record<string, Item> } } };
    expect(s.properties.items.required).toEqual(['base', 'step', 'edge', 'complexity']);
    expect(Object.keys(s.properties.items.properties.step.properties)).toEqual(['evidence', 'verdict', 'why', 'score']);
  });
  it('reads grades keyed by rubric id', () => {
    const g = normalizeGrade({ items: { step: { verdict: 'full', score: 3, why: 'adds n % 10' } }, misconception: 'm', summary: 's' }, a);
    expect(g.items.find((i) => i.itemId === 'step')).toMatchObject({ score: 3, why: 'adds n % 10' });
  });
});

describe('make-up work', () => {
  const low = { ...grade('s2', { base: 0, step: 1, edge: 0, complexity: 0 }), status: 'approved' as const };
  it('only approved scores under the threshold need a check-in', () => {
    expect(needsCheckIn(low, a, 0.3)).toBe(true);
    expect(needsCheckIn({ ...low, status: 'suggested' }, a, 0.3)).toBe(false);
    expect(needsCheckIn({ ...grade('s3', { base: 0 }), status: 'approved' }, a, 0.3)).toBe(false);
    expect(checkIns([low], DEMO_ASSIGNMENTS, {}, 0.3)[0].makeup.status).toBe('needs-meeting');
  });
  it('caps the make-up and never lowers the score', () => {
    expect(finalScore(1, 10, 10, 0.7)).toBe(7);
    expect(finalScore(1, 5, 10, 0.7)).toBe(5);
    expect(finalScore(2, 0, 10, 0.7)).toBe(2);
    expect(finalScore(2, undefined, 10, 0.7)).toBe(2);
  });
  it('grades the make-up on the new question with the same rubric points', () => {
    const m = makeupAssignment(a, { submissionId: 'x', assignmentId: a.id, studentId: 's2', status: 'sent', notes: '', question: 'Q2', criteria: { step: 'new step' } });
    expect(m.prompt).toBe('Q2');
    expect(m.rubric.map((r) => r.points)).toEqual(a.rubric.map((r) => r.points));
    expect(m.rubric.find((r) => r.id === 'step')?.criteria).toBe('new step');
    expect(m.rubric.find((r) => r.id === 'base')?.criteria).toBe(a.rubric[0].criteria);
  });
  it('never puts the student answer in the make-up prompt', () => {
    const p = makeupPrompt(a, low, 'unsure when recursion stops');
    expect(p).toContain('unsure when recursion stops');
    expect(p).toContain('Base case: 0/3');
    expect(p).not.toContain('def digit_sum');
  });
});

describe('skills', () => {
  const grades = [grade('s1', {}), grade('s2', { base: 0, step: 1 }, 'Thinks recursion stops by itself.')];
  it('computes skill levels from rubric points', () => {
    const map = skillMap('s2', grades, DEMO_ASSIGNMENTS);
    expect(map.find((m) => m.skill === 'Recursion')).toMatchObject({ earned: 1, possible: 6, level: 'weak' });
  });
  it('lists only students with weak skills', () => {
    expect(studentsToTalkTo(roster, grades, DEMO_ASSIGNMENTS).map((t) => t.student.id)).toEqual(['s2']);
  });
  it('class payload holds averages and misconceptions, never answers or names after pseudonymizing', () => {
    const p = pseudonymize(insightsPayload(a, [grade('s3', { base: 0 }, 'Wei Chen used a loop instead of recursion.')]), roster).text;
    expect(p).toContain('Base case (Recursion): average 0.0 / 3');
    expect(p).not.toMatch(/Wei|Chen/);
  });
});
