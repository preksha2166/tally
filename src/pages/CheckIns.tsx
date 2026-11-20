import { useState } from 'react';
import { useApp } from '../app/context';
import { Card, Empty, errorText, RanOnBadge } from '../app/ui';
import { createMakeupQuestion, gradeMakeup, saveMakeup } from '../actions';
import { checkIns, finalScore, type CheckIn } from '../makeup';
import { setState, useStore } from '../store';
import { totalScore } from '../skills';
import type { Makeup, MakeupStatus } from '../types';

const STEPS: { status: MakeupStatus; label: string }[] = [
  { status: 'needs-meeting', label: 'Meet' },
  { status: 'met', label: 'Make-up question' },
  { status: 'question-ready', label: 'Send' },
  { status: 'sent', label: 'Grade answer' },
  { status: 'graded', label: 'Final score' },
];

const pct = (x: number) => Math.round(x * 100);

/** Low scores open a second chance, but only after the TA has talked to the student in person. */
export function CheckIns() {
  const grades = useStore((s) => s.grades);
  const assignments = useStore((s) => s.assignments);
  const makeups = useStore((s) => s.makeups);
  const students = useStore((s) => s.students);
  const settings = useStore((s) => s.settings);
  const [open, setOpen] = useState<string | null>(null);

  const list = checkIns(Object.values(grades), assignments, makeups, settings.makeupThreshold);
  const setPct = (key: 'makeupThreshold' | 'makeupCap', v: string) => {
    const n = Math.min(100, Math.max(0, Number(v) || 0)) / 100;
    setState((s) => ({ ...s, settings: { ...s.settings, [key]: n } }));
  };

  return (
    <Card title="Check-ins and make-up work">
      <p className="muted small">
        Students with an approved score under{' '}
        <input className="pct-input" type="number" min={0} max={100} step={5} value={pct(settings.makeupThreshold)} onChange={(e) => setPct('makeupThreshold', e.target.value)} aria-label="Check-in threshold percent" />%{' '}
        get a make-up question after they meet you in person. A make-up can raise the score to at most{' '}
        <input className="pct-input" type="number" min={0} max={100} step={5} value={pct(settings.makeupCap)} onChange={(e) => setPct('makeupCap', e.target.value)} aria-label="Make-up cap percent" />% and never lowers it.
      </p>
      {list.length === 0 ? (
        <Empty>No approved scores below {pct(settings.makeupThreshold)}%. Approve grades on the Grade page first.</Empty>
      ) : (
        <ul className="talk-list">
          {list.map((c) => {
            const st = students.find((x) => x.id === c.grade.studentId);
            const t = totalScore(c.grade, c.assignment);
            const isOpen = open === c.grade.submissionId;
            return (
              <li key={c.grade.submissionId} className="checkin">
                <div className="talk-item">
                  <div>
                    <strong>{st?.name}</strong>
                    <div className="muted small">{c.assignment.title} · {t.earned}/{t.possible}</div>
                  </div>
                  <Steps status={c.makeup.status} />
                  <button className="btn" onClick={() => setOpen(isOpen ? null : c.grade.submissionId)}>{isOpen ? 'Close' : 'Open'}</button>
                </div>
                {isOpen && <MakeupPanel c={c} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Steps({ status }: { status: MakeupStatus }) {
  const at = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="steps" aria-label="Make-up progress">
      {STEPS.map((s, i) => (
        <li key={s.status} className={i < at ? 'done' : i === at ? 'now' : ''}>{s.label}</li>
      ))}
    </ol>
  );
}

function MakeupPanel({ c }: { c: CheckIn }) {
  const { engine, cfg, device } = useApp();
  const student = useStore((s) => s.students.find((x) => x.id === c.grade.studentId))!;
  const cap = useStore((s) => s.settings.makeupCap);
  const m = c.makeup;
  const a = c.assignment;
  const first = student.name.split(' ')[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState('');

  const save = (patch: Partial<Makeup>) => saveMakeup(m, patch);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  };

  async function grade(withConsent: boolean) {
    setConsent('');
    await run(async () => {
      const r = await gradeMakeup(engine, cfg, m, device, withConsent);
      if (r.status === 'needs-consent') setConsent(r.reason);
      if (r.status === 'blocked') setError(`${r.reason} Cloud grading is turned off in Setup, so nothing was sent.`);
    });
  }

  const orig = totalScore(c.grade, a);
  const mk = m.grade ? m.grade.items.reduce((s, i) => s + i.score, 0) : undefined;
  const final = finalScore(orig.earned, mk, orig.possible, cap);
  const mailto = m.question
    ? `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(`Make-up question for ${a.title}`)}&body=${encodeURIComponent(`Hi ${first},\n\nThanks for meeting with me. Here is your make-up question:\n\n${m.question}\n\nReply with your answer.`)}`
    : '';

  return (
    <div className="makeup">
      {/* 1. Meeting */}
      <label className="field">
        <span>Meeting notes (private, stay on this laptop; names are hidden if the AI uses them)</span>
        <textarea rows={3} value={m.notes} placeholder={`What did ${first} find hard? e.g. "didn't know when recursion should stop"`}
          onChange={(e) => save({ notes: e.target.value })} />
      </label>
      {!m.metAt ? (
        <div className="row">
          <p className="muted small">The make-up opens only after you talk to {first} in person.</p>
          <button className="btn btn-primary" onClick={() => save({ status: 'met', metAt: Date.now() })}>Mark as met in person</button>
        </div>
      ) : (
        <p className="muted small">✓ Met in person on {new Date(m.metAt).toLocaleDateString()}.</p>
      )}

      {/* 2. Question */}
      {m.metAt && (
        <div className="makeup-step">
          <div className="row">
            <h3>Make-up question</h3>
            {m.questionRanOn && <RanOnBadge ranOn={m.questionRanOn} />}
            <button className="btn" disabled={busy} onClick={() => run(() => createMakeupQuestion(engine, m))}>
              {busy && !m.question ? 'Writing…' : m.question ? 'Write a new one' : 'Create make-up question'}
            </button>
          </div>
          {!m.question && <p className="muted small">Written from the question, the rubric, the points {first} lost and your notes. {first}'s answer is not sent.</p>}
          {m.question && (
            <>
              <textarea rows={4} value={m.question} aria-label="Make-up question" onChange={(e) => save({ question: e.target.value })} />
              <details>
                <summary>Full credit on the make-up means…</summary>
                <ul className="small">
                  {a.rubric.map((r) => <li key={r.id}><strong>{r.name}</strong> ({r.points} pts): {m.criteria?.[r.id] ?? r.criteria}</li>)}
                </ul>
              </details>
              <div className="row end">
                <a className="btn btn-primary" href={mailto} onClick={() => save({ status: m.status === 'question-ready' ? 'sent' : m.status })}>
                  {m.status === 'question-ready' ? `Approve and email ${first}` : '✓ Sent · send again'}
                </a>
              </div>
            </>
          )}
        </div>
      )}

      {/* 3. Answer and grade */}
      {(m.status === 'sent' || m.status === 'graded') && (
        <div className="makeup-step">
          <h3>{first}'s make-up answer</h3>
          <textarea className="code-input" rows={6} value={m.answer ?? ''} placeholder="Paste the answer here. It stays in this browser."
            onChange={(e) => save({ answer: e.target.value })} />
          <div className="row end">
            <button className="btn btn-primary" disabled={busy || !m.answer?.trim()} onClick={() => grade(false)}>
              {busy ? 'Grading…' : m.grade ? 'Re-grade make-up' : 'Grade make-up'}
            </button>
          </div>
          {consent && (
            <div className="consent" role="alertdialog" aria-label="Use the cloud?">
              <strong>Gemini Nano isn't available.</strong> {consent}
              <p>Grade in the cloud instead? Names, emails and IDs are replaced first.</p>
              <div className="row">
                <button className="btn btn-primary" onClick={() => grade(true)}>Grade in the cloud</button>
                <button className="btn" onClick={() => setConsent('')}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {m.grade && (
        <div className="makeup-step">
          <div className="row">
            <h3>Make-up grade {mk}/{orig.possible}</h3>
            <RanOnBadge ranOn={m.grade.ranOn} ms={m.grade.ms} lane={m.grade.lane} />
          </div>
          <table className="rubric">
            <tbody>
              {a.rubric.map((r) => {
                const ig = m.grade!.items.find((i) => i.itemId === r.id)!;
                return (
                  <tr key={r.id} className={ig.score < r.points ? 'lost' : ''}>
                    <td><strong>{r.name}</strong></td>
                    <td className="score-cell">
                      <input type="number" min={0} max={r.points} step={0.5} value={ig.score} aria-label={`${r.name} make-up score`}
                        onChange={(e) => {
                          const v = Math.min(r.points, Math.max(0, Number(e.target.value) || 0));
                          save({ grade: { ...m.grade!, approved: false, items: m.grade!.items.map((i) => (i.itemId === r.id ? { ...i, score: v } : i)) } });
                        }} /> <span className="muted">/ {r.points}</span>
                    </td>
                    <td className="small">{ig.why}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="final-score">
            Original {orig.earned}/{orig.possible} → make-up {mk}/{orig.possible} (capped at {Math.round(orig.possible * cap * 2) / 2}) →{' '}
            <strong>counts as {final}/{orig.possible}</strong>
          </div>
          <div className="row end">
            <span className="muted small">The AI only suggests. You approve the final score.</span>
            <button className={`btn ${m.grade.approved ? 'btn-done' : 'btn-primary'}`}
              onClick={() => save({ grade: { ...m.grade!, approved: !m.grade!.approved } })}>
              {m.grade.approved ? '✓ Approved' : 'Approve make-up grade'}
            </button>
          </div>
        </div>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
    </div>
  );
}
