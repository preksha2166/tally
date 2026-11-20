import type { Engine, GradeOutcome, RuntimeConfig } from './ai/engine';
import { makeupAssignment } from './makeup';
import { DeviceNotReadyError } from './ai/device';
import { insightsPayload } from './ai/prompts';
import { pseudonymize, reidentify } from './privacy/pseudonym';
import { countCall, getState, setState } from './store';
import type { Assignment, DeviceStatus, Grade, Makeup, Student } from './types';

/**
 * The hybrid routing policy, in one place:
 *  1. Raw student work goes to Gemini Nano only (ONLY_ON_DEVICE), after our own availability check.
 *  2. Without Nano, the TA's setting decides: never / ask / allow. When allowed, names, emails
 *     and IDs are replaced with aliases first and the call is PREFER_ON_DEVICE (so the cloud).
 *  3. Feedback drafts and class insights are always built from de-identified text.
 */

export type GradeAttempt =
  | { status: 'done'; grade: Grade }
  | { status: 'needs-consent'; reason: string }
  | { status: 'blocked'; reason: string };

export function nanoReady(device: DeviceStatus | null): boolean {
  const s = getState().settings;
  return !s.simulateNoNano && !!device?.api && device.text === 'available';
}

function whyNoNano(device: DeviceStatus | null, tooLong: boolean): string {
  if (getState().settings.simulateNoNano) return 'Demo switch is on: acting as if this device has no Gemini Nano.';
  if (tooLong) return 'This answer is too long for Gemini Nano on this device.';
  if (!device?.api) return 'This browser has no on-device AI.';
  return `Gemini Nano is ${device.text} on this device.`;
}

type Lane = 'private' | 'pseudonymized';
type RoutedGrade =
  | { status: 'done'; out: GradeOutcome; lane: Lane }
  | { status: 'needs-consent'; reason: string }
  | { status: 'blocked'; reason: string };

/** Policy 1 and 2 above, for any answer text: used for normal submissions and make-up answers. */
async function routeGrade(
  engine: Engine,
  cfg: RuntimeConfig,
  a: Assignment,
  student: Student,
  text: string,
  device: DeviceStatus | null,
  consent: boolean,
): Promise<RoutedGrade> {
  const s = getState();
  const tooLong = text.length > cfg.maxDeviceChars;
  let lane: Lane = nanoReady(device) && !tooLong ? 'private' : 'pseudonymized';

  const run = (l: Lane) => engine.grade(a, student.alias, l === 'private' ? text : pseudonymize(text, s.students).text, l);

  let out: GradeOutcome | undefined;
  try {
    if (lane === 'private') out = await run('private');
  } catch (e) {
    if (!(e instanceof DeviceNotReadyError)) throw e;
    lane = 'pseudonymized';
  }
  if (!out) {
    const policy = s.settings.cloudFallback;
    const reason = whyNoNano(device, tooLong);
    if (policy === 'never') return { status: 'blocked', reason };
    if (policy === 'ask' && !consent) return { status: 'needs-consent', reason };
    out = await run('pseudonymized');
  }
  countCall(out.ranOn, lane === 'pseudonymized');
  return { status: 'done', out, lane };
}

export async function gradeSubmission(
  engine: Engine,
  cfg: RuntimeConfig,
  submissionId: string,
  device: DeviceStatus | null,
  consent = false,
): Promise<GradeAttempt> {
  const s = getState();
  const sub = s.submissions.find((x) => x.id === submissionId);
  const a = s.assignments.find((x) => x.id === sub?.assignmentId);
  const student = s.students.find((x) => x.id === sub?.studentId);
  if (!sub || !a || !student) throw new Error('Submission not found.');

  const r = await routeGrade(engine, cfg, a, student, sub.text, device, consent);
  if (r.status !== 'done') return r;
  const { out, lane } = r;

  const grade: Grade = {
    submissionId: sub.id,
    assignmentId: a.id,
    studentId: student.id,
    items: out.items.map((i) => ({ ...i, why: reidentify(i.why, s.students) })),
    misconception: reidentify(out.misconception, s.students),
    summary: reidentify(out.summary, s.students),
    status: 'suggested',
    ranOn: out.ranOn,
    lane,
    ms: out.ms,
    gradedAt: Date.now(),
  };
  setState((st) => ({ ...st, grades: { ...st.grades, [sub.id]: grade } }));
  return { status: 'done', grade };
}

export async function draftFeedback(engine: Engine, submissionId: string): Promise<void> {
  const s = getState();
  const sub = s.submissions.find((x) => x.id === submissionId);
  const g = s.grades[submissionId];
  const a = s.assignments.find((x) => x.id === sub?.assignmentId);
  const student = s.students.find((x) => x.id === sub?.studentId);
  if (!sub || !g || !a || !student) throw new Error('Grade the submission first.');

  // De-identify everything: this call may run in the cloud when Nano is unavailable.
  const safeGrade: Grade = {
    ...g,
    items: g.items.map((i) => ({ ...i, why: pseudonymize(i.why, s.students).text })),
    misconception: pseudonymize(g.misconception, s.students).text,
  };
  const out = await engine.feedback(a, safeGrade, student.alias, pseudonymize(sub.text, s.students).text);
  countCall(out.ranOn, true);
  setState((st) => ({
    ...st,
    feedback: {
      ...st.feedback,
      [submissionId]: {
        submissionId,
        studentId: student.id,
        text: reidentify(out.text, st.students),
        status: 'draft',
        ranOn: out.ranOn,
        updatedAt: Date.now(),
      },
    },
  }));
}

/** Creates or patches the make-up record for an original submission. */
export function saveMakeup(base: Makeup, patch: Partial<Makeup>): void {
  setState((st) => ({
    ...st,
    makeups: { ...st.makeups, [base.submissionId]: { ...(st.makeups[base.submissionId] ?? base), ...patch } },
  }));
}

/** Writes the make-up question. Only allowed after the in-person meeting. */
export async function createMakeupQuestion(engine: Engine, m: Makeup): Promise<void> {
  const s = getState();
  const g = s.grades[m.submissionId];
  const a = s.assignments.find((x) => x.id === m.assignmentId);
  if (!g || !a) throw new Error('Original grade not found.');
  if (!m.metAt) throw new Error('Mark the in-person meeting first.');

  // Policy 3: de-identified input only. The student's answer is not part of the prompt at all.
  const safeGrade: Grade = {
    ...g,
    items: g.items.map((i) => ({ ...i, why: pseudonymize(i.why, s.students).text })),
    misconception: pseudonymize(g.misconception, s.students).text,
  };
  const out = await engine.makeupQuestion(a, safeGrade, pseudonymize(m.notes, s.students).text);
  countCall(out.ranOn, true);
  saveMakeup(m, {
    status: 'question-ready',
    question: reidentify(out.question, s.students),
    criteria: out.criteria,
    questionRanOn: out.ranOn,
    grade: undefined,
  });
}

/** Grades the make-up answer with the same privacy routing as any other student work. */
export async function gradeMakeup(
  engine: Engine,
  cfg: RuntimeConfig,
  m: Makeup,
  device: DeviceStatus | null,
  consent = false,
): Promise<{ status: 'done' } | { status: 'needs-consent' | 'blocked'; reason: string }> {
  const s = getState();
  const a = s.assignments.find((x) => x.id === m.assignmentId);
  const student = s.students.find((x) => x.id === m.studentId);
  if (!a || !student || !m.answer?.trim()) throw new Error('Paste the make-up answer first.');

  const r = await routeGrade(engine, cfg, makeupAssignment(a, m), student, m.answer, device, consent);
  if (r.status !== 'done') return r;
  saveMakeup(m, {
    status: 'graded',
    grade: {
      items: r.out.items.map((i) => ({ ...i, why: reidentify(i.why, s.students) })),
      misconception: reidentify(r.out.misconception, s.students),
      ranOn: r.out.ranOn,
      lane: r.lane,
      ms: r.out.ms,
      approved: false,
    },
  });
  return { status: 'done' };
}

export function insightsInput(assignmentId: string): string {
  const s = getState();
  const a = s.assignments.find((x) => x.id === assignmentId);
  if (!a) return '';
  const grades = Object.values(s.grades).filter((g) => g.assignmentId === assignmentId);
  return pseudonymize(insightsPayload(a, grades), s.students).text;
}

export async function classInsights(engine: Engine, assignmentId: string): Promise<void> {
  const sent = insightsInput(assignmentId);
  const out = await engine.insights(sent);
  countCall(out.ranOn, true);
  setState((st) => ({
    ...st,
    insights: { ...st.insights, [assignmentId]: { text: out.text, ranOn: out.ranOn, ms: out.ms, sent, createdAt: Date.now() } },
  }));
}
