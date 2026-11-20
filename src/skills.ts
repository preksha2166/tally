import type { Assignment, Grade, SkillLevel, SkillScore, Student } from './types';

/**
 * Skill maps are computed with plain arithmetic from rubric scores, not by the AI,
 * so a student's "weak area" is always traceable to specific graded items.
 */
export function levelFor(ratio: number): SkillLevel {
  if (ratio >= 0.8) return 'strong';
  if (ratio >= 0.5) return 'ok';
  return 'weak';
}

export function skillMap(studentId: string, grades: Grade[], assignments: Assignment[]): SkillScore[] {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const acc = new Map<string, { earned: number; possible: number }>();
  for (const g of grades) {
    if (g.studentId !== studentId) continue;
    const a = byId.get(g.assignmentId);
    if (!a) continue;
    for (const ig of g.items) {
      const item = a.rubric.find((r) => r.id === ig.itemId);
      if (!item) continue;
      const cur = acc.get(item.skill) ?? { earned: 0, possible: 0 };
      cur.earned += ig.score;
      cur.possible += item.points;
      acc.set(item.skill, cur);
    }
  }
  return [...acc.entries()]
    .map(([skill, v]) => ({ skill, ...v, level: levelFor(v.possible ? v.earned / v.possible : 0) }))
    .sort((a, b) => a.earned / (a.possible || 1) - b.earned / (b.possible || 1));
}

export interface TalkTo {
  student: Student;
  weak: SkillScore[];
  percent: number;
}

/** Students with at least one weak skill, most in need first. */
export function studentsToTalkTo(students: Student[], grades: Grade[], assignments: Assignment[]): TalkTo[] {
  return students
    .map((student) => {
      const map = skillMap(student.id, grades, assignments);
      const earned = map.reduce((s, m) => s + m.earned, 0);
      const possible = map.reduce((s, m) => s + m.possible, 0);
      return { student, weak: map.filter((m) => m.level === 'weak'), percent: possible ? earned / possible : 1 };
    })
    .filter((t) => t.weak.length > 0)
    .sort((a, b) => b.weak.length - a.weak.length || a.percent - b.percent);
}

export function totalScore(g: Grade, a: Assignment): { earned: number; possible: number } {
  const possible = a.rubric.reduce((s, r) => s + r.points, 0);
  const earned = g.items.reduce((s, i) => s + i.score, 0);
  return { earned, possible };
}
