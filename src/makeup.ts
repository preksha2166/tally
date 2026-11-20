import { totalScore } from './skills';
import type { Assignment, Grade, Makeup } from './types';

/**
 * Make-up rules, in plain arithmetic so the TA can predict them:
 *  - Only grades the TA approved count, so a wrong AI suggestion never triggers a check-in by itself.
 *  - Below `threshold` of the points (0.3 = under 3/10), the student needs an in-person check-in.
 *  - After the meeting they get one make-up question on the same rubric.
 *  - The make-up can raise the score up to `cap` of the points, and never lowers it.
 */

export function needsCheckIn(g: Grade, a: Assignment, threshold: number): boolean {
  if (g.status !== 'approved') return false;
  const t = totalScore(g, a);
  return t.possible > 0 && t.earned / t.possible < threshold;
}

export interface CheckIn {
  grade: Grade;
  assignment: Assignment;
  makeup: Makeup;
}

/** Every approved low score, with its make-up record (a fresh one if the TA hasn't started yet). */
export function checkIns(
  grades: Grade[],
  assignments: Assignment[],
  makeups: Record<string, Makeup>,
  threshold: number,
): CheckIn[] {
  const out: CheckIn[] = [];
  for (const g of grades) {
    const a = assignments.find((x) => x.id === g.assignmentId);
    if (!a) continue;
    const existing = makeups[g.submissionId];
    // Keep a started make-up visible even if the TA later edits the original grade upwards.
    if (!existing && !needsCheckIn(g, a, threshold)) continue;
    out.push({
      grade: g,
      assignment: a,
      makeup: existing ?? {
        submissionId: g.submissionId,
        assignmentId: a.id,
        studentId: g.studentId,
        status: 'needs-meeting',
        notes: '',
      },
    });
  }
  return out;
}

/** The score that counts after a make-up: the better of the two, with the make-up capped. */
export function finalScore(original: number, makeup: number | undefined, possible: number, cap: number): number {
  if (makeup === undefined) return original;
  const capped = Math.min(makeup, Math.round(possible * cap * 2) / 2);
  return Math.max(original, capped);
}

/** The assignment as the make-up answer is graded: new question, same rubric items and points. */
export function makeupAssignment(a: Assignment, m: Makeup): Assignment {
  return {
    ...a,
    id: `${a.id}-makeup`,
    title: `${a.title} (make-up)`,
    prompt: m.question ?? a.prompt,
    rubric: a.rubric.map((r) => ({ ...r, criteria: m.criteria?.[r.id] || r.criteria })),
  };
}
