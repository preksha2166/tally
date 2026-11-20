import type { Assignment, Grade } from '../types';

export const GRADE_SYSTEM = `You are a careful, fair teaching assistant grading one student's answer against a rubric.
"items" has one entry for every rubric id. Grade all of them. For each rubric item, in this order:
- evidence: copy, word for word, the line(s) of the answer this item is about. Write "none" if nothing in the answer addresses it.
- verdict: compare the evidence with the item's criteria. "full" if it meets them, "partial" if it meets some, "none" if it meets none.
- why: at most 15 words. Say what is missing or wrong, or what they did well. Only mention code that appears in the evidence.
- score: "full" = the item's points, "none" = 0, "partial" = something in between (half points allowed).
Judge what the code actually does when run, not what it looks like.
Then:
- misconception: the single underlying misunderstanding behind the mistakes, in at most 15 words ("None" if full marks).
- summary: one sentence of at most 15 words about the whole answer.
Judge only against the rubric. Do not reward length. Answer only with JSON.`;

export const FEEDBACK_SYSTEM = `You write short, kind, personal feedback from a teaching assistant to one student.
Rules: at most 160 words. Start with one specific thing they did well. Then, for each rubric item where they lost points, explain what they should have written and why, with a tiny example when it helps. End with one concrete next step. Address the student by the alias you are given. Plain text, no headings, no markdown.`;

export const INSIGHTS_SYSTEM = `You help a professor decide what to re-teach. You receive anonymized class results for one assignment: average score per rubric item and the misconceptions found in individual answers.
Write 3 to 5 short bullet points: the most common misunderstandings (with how many students), and end with a 10-minute plan for the next class. Plain text bullets starting with "- ".`;

export function rubricBlock(a: Assignment): string {
  return a.rubric.map((r) => `- [${r.id}] ${r.name} (${r.points} pts): ${r.criteria}`).join('\n');
}

export function gradePrompt(a: Assignment, alias: string, answer: string): string {
  return `Question:\n${a.prompt}\n\nRubric:\n${rubricBlock(a)}\n\nAnswer from ${alias}:\n"""\n${answer}\n"""`;
}

export function feedbackPrompt(a: Assignment, g: Grade, alias: string, answer: string): string {
  const lines = a.rubric.map((r) => {
    const ig = g.items.find((i) => i.itemId === r.id);
    return `- ${r.name}: ${ig?.score ?? 0}/${r.points}. ${ig?.why ?? ''}`;
  });
  return `Student alias: ${alias}\nQuestion:\n${a.prompt}\n\nTheir answer:\n"""\n${answer}\n"""\n\nGrading:\n${lines.join('\n')}\nMain misconception: ${g.misconception}`;
}

export const MAKEUP_SYSTEM = `You write one make-up question for a student who scored low on an assignment and has since met their teaching assistant.
Rules:
- question: a new task of the same difficulty that tests the same skills. It must not be the original task renamed. Focus on the rubric items the student lost the most points on, and use the TA's meeting notes. At most 80 words, plain text.
- criteria: for every rubric id, one sentence saying what full credit means for the new question.
Answer only with JSON.`;

/** Built from the question, rubric, lost points and the TA's notes. The student's answer is never included. */
export function makeupPrompt(a: Assignment, g: Grade, notes: string): string {
  const lost = a.rubric
    .map((r) => {
      const ig = g.items.find((i) => i.itemId === r.id);
      const score = ig?.score ?? 0;
      return score < r.points ? `- ${r.name}: ${score}/${r.points}. ${ig?.why ?? ''}` : null;
    })
    .filter(Boolean);
  return `Original question:\n${a.prompt}\n\nRubric:\n${rubricBlock(a)}\n\nPoints lost on:\n${lost.join('\n') || '- none'}\nMain misconception: ${g.misconception}\n\nTA's notes from the meeting:\n${notes.trim() || '(none)'}`;
}

/** Builds the only payload the class-insights call ever sends: numbers and anonymized sentences. */
export function insightsPayload(a: Assignment, grades: Grade[]): string {
  const n = grades.length;
  const avgs = a.rubric.map((r) => {
    const scores = grades.map((g) => g.items.find((i) => i.itemId === r.id)?.score ?? 0);
    const avg = scores.reduce((s, x) => s + x, 0) / (n || 1);
    return `- ${r.name} (${r.skill}): average ${avg.toFixed(1)} / ${r.points}`;
  });
  const misc = grades
    .map((g) => g.misconception)
    .filter((m) => m && !/^none\.?$/i.test(m.trim()))
    .map((m) => `- ${m}`);
  return `Assignment: ${a.title}\nStudents graded: ${n}\n\nAverage per rubric item:\n${avgs.join('\n')}\n\nMisconceptions found:\n${misc.join('\n') || '- none'}`;
}
