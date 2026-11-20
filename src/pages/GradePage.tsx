import { useMemo, useState } from 'react';
import { useApp } from '../app/context';
import { Card, Empty, errorText, RanOnBadge } from '../app/ui';
import { draftFeedback, gradeSubmission, nanoReady } from '../actions';
import { pseudonymize } from '../privacy/pseudonym';
import { setState, useStore } from '../store';
import { totalScore } from '../skills';
import type { Grade } from '../types';

type Consent = { reason: string; ids: string[] } | null;

export function GradePage() {
  const { engine, cfg, device } = useApp();
  const assignments = useStore((s) => s.assignments);
  const students = useStore((s) => s.students);
  const submissions = useStore((s) => s.submissions);
  const grades = useStore((s) => s.grades);
  const feedback = useStore((s) => s.feedback);

  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '');
  const a = assignments.find((x) => x.id === assignmentId);
  const subs = useMemo(() => submissions.filter((s) => s.assignmentId === assignmentId), [submissions, assignmentId]);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = subs.find((s) => s.id === selected) ?? subs[0];
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [consent, setConsent] = useState<Consent>(null);

  const mark = (id: string, on: boolean) =>
    setBusy((b) => {
      const n = new Set(b);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function grade(ids: string[], withConsent = false) {
    setError('');
    setConsent(null);
    for (const id of ids) {
      mark(id, true);
      try {
        const r = await gradeSubmission(engine, cfg, id, device, withConsent);
        if (r.status === 'needs-consent') {
          setConsent({ reason: r.reason, ids: ids.slice(ids.indexOf(id)) });
          mark(id, false);
          return;
        }
        if (r.status === 'blocked') {
          setError(`${r.reason} Cloud grading is turned off in Settings, so nothing was sent.`);
          mark(id, false);
          return;
        }
      } catch (e) {
        setError(errorText(e));
        mark(id, false);
        return;
      }
      mark(id, false);
    }
  }

  if (!a) return <Empty>No assignments yet. Add one in Setup.</Empty>;
  const ungraded = subs.filter((s) => !grades[s.id]).map((s) => s.id);
  const local = nanoReady(device);

  return (
    <div className="grade-layout">
      <aside className="queue">
        <label className="field">
          <span>Assignment</span>
          <select value={assignmentId} onChange={(e) => { setAssignmentId(e.target.value); setSelected(null); }}>
            {assignments.map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary wide" disabled={!ungraded.length || busy.size > 0} onClick={() => grade(ungraded)}>
          {busy.size ? 'Grading…' : ungraded.length ? `Grade ${ungraded.length} ${local ? 'on this device' : 'submissions'}` : 'All graded'}
        </button>
        <p className="hint">{local ? '🔒 Student work stays on this laptop. Gemini Nano grades it locally.' : '☁️ No Gemini Nano here. TAlly will ask before using the cloud, with names and IDs replaced.'}</p>
        <ul className="queue-list">
          {subs.map((s) => {
            const st = students.find((x) => x.id === s.studentId);
            const g = grades[s.id];
            const f = feedback[s.id];
            const t = g ? totalScore(g, a) : null;
            return (
              <li key={s.id}>
                <button className={`queue-item ${sel?.id === s.id ? 'active' : ''}`} onClick={() => setSelected(s.id)}>
                  <span className="qi-name">{st?.name}</span>
                  <span className="qi-meta">
                    {busy.has(s.id) ? <span className="chip">Grading…</span> : g ? (
                      <>
                        <span className="qi-score">{t!.earned}/{t!.possible}</span>
                        <span className={`chip ${g.status === 'approved' ? 'chip-strong' : ''}`}>{g.status === 'approved' ? 'Approved' : 'Check'}</span>
                        {f?.status === 'sent' && <span className="chip chip-sent">Sent</span>}
                      </>
                    ) : (
                      <span className="chip chip-muted">Not graded</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="detail">
        {consent && (
          <div className="consent" role="alertdialog" aria-label="Use the cloud?">
            <strong>Gemini Nano isn't available.</strong> {consent.reason}
            <p>Grade in the cloud instead? Names, emails and student IDs are replaced with aliases like "Student 03" before anything is sent, and put back on this laptop afterwards.</p>
            {sel && (
              <details>
                <summary>Show exactly what the cloud would see for {students.find((x) => x.id === sel.studentId)?.name}</summary>
                <pre className="code">{pseudonymize(sel.text, students).text}</pre>
              </details>
            )}
            <div className="row">
              <button className="btn btn-primary" onClick={() => grade(consent.ids, true)}>Grade in the cloud</button>
              <button className="btn" onClick={() => setConsent(null)}>Cancel</button>
            </div>
          </div>
        )}
        {error && <div className="alert" role="alert">{error}</div>}
        {sel ? <SubmissionDetail key={sel.id} submissionId={sel.id} busy={busy.has(sel.id)} onGrade={() => grade([sel.id])} /> : <Empty>No submissions for this assignment.</Empty>}
      </div>
    </div>
  );
}

function SubmissionDetail({ submissionId, busy, onGrade }: { submissionId: string; busy: boolean; onGrade: () => void }) {
  const { engine } = useApp();
  const sub = useStore((s) => s.submissions.find((x) => x.id === submissionId))!;
  const a = useStore((s) => s.assignments.find((x) => x.id === sub.assignmentId))!;
  const student = useStore((s) => s.students.find((x) => x.id === sub.studentId))!;
  const g = useStore((s) => s.grades[submissionId]);
  const f = useStore((s) => s.feedback[submissionId]);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbError, setFbError] = useState('');

  const updateGrade = (patch: (g: Grade) => Grade) =>
    setState((s) => ({ ...s, grades: { ...s.grades, [submissionId]: patch(s.grades[submissionId]) } }));

  const t = g ? totalScore(g, a) : null;

  async function makeFeedback() {
    setFbBusy(true);
    setFbError('');
    try {
      await draftFeedback(engine, submissionId);
    } catch (e) {
      setFbError(errorText(e));
    }
    setFbBusy(false);
  }

  const mailto = f
    ? `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(`Feedback on ${a.title}`)}&body=${encodeURIComponent(f.text)}`
    : '';

  return (
    <>
      <Card
        title={<>{student.name} <span className="muted">· {a.title}</span></>}
        actions={!g && <button className="btn btn-primary" disabled={busy} onClick={onGrade}>{busy ? 'Grading…' : 'Grade this answer'}</button>}
      >
        <details className="prompt"><summary>Question</summary><p>{a.prompt}</p></details>
        <pre className="code answer">{sub.text}</pre>
      </Card>

      {g && (
        <Card
          title={<>Suggested grade <span className="score">{t!.earned} / {t!.possible}</span></>}
          actions={<RanOnBadge ranOn={g.ranOn} ms={g.ms} lane={g.lane} />}
        >
          <table className="rubric">
            <thead>
              <tr><th>Rubric item</th><th>Score</th><th>Why</th></tr>
            </thead>
            <tbody>
              {a.rubric.map((r) => {
                const ig = g.items.find((i) => i.itemId === r.id)!;
                const lost = ig.score < r.points;
                return (
                  <tr key={r.id} className={lost ? 'lost' : ''}>
                    <td><strong>{r.name}</strong><div className="muted small">{r.skill}</div></td>
                    <td className="score-cell">
                      <input
                        type="number" min={0} max={r.points} step={0.5} value={ig.score}
                        aria-label={`${r.name} score`}
                        onChange={(e) => {
                          const v = Math.min(r.points, Math.max(0, Number(e.target.value) || 0));
                          updateGrade((old) => ({ ...old, status: 'suggested', items: old.items.map((i) => (i.itemId === r.id ? { ...i, score: v } : i)) }));
                        }}
                      /> <span className="muted">/ {r.points}</span>
                    </td>
                    <td>
                      <textarea
                        rows={2} value={ig.why} aria-label={`${r.name} reason`}
                        onChange={(e) => updateGrade((old) => ({ ...old, items: old.items.map((i) => (i.itemId === r.id ? { ...i, why: e.target.value } : i)) }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="why-box">
            <span className="label">{g.misconception === 'None' ? 'Main misunderstanding' : `Why ${student.name.split(' ')[0]} struggled`}</span>
            <p>{g.misconception === 'None' ? 'No misunderstanding found. All rubric items met.' : g.misconception}</p>
          </div>
          <div className="row end">
            <span className="muted small">The AI only suggests. You approve every grade.</span>
            <button className="btn" onClick={onGrade} disabled={busy}>Re-grade</button>
            <button
              className={`btn ${g.status === 'approved' ? 'btn-done' : 'btn-primary'}`}
              onClick={() => updateGrade((old) => ({ ...old, status: old.status === 'approved' ? 'suggested' : 'approved' }))}
            >
              {g.status === 'approved' ? '✓ Approved' : 'Approve grade'}
            </button>
          </div>
        </Card>
      )}

      {g && (
        <Card
          title="Personal feedback"
          actions={f && <RanOnBadge ranOn={f.ranOn} />}
        >
          {!f ? (
            <div className="row">
              <p className="muted">Draft a message that explains what {student.name.split(' ')[0]} should have written and why. Names are hidden from the AI and filled in on this laptop.</p>
              <button className="btn btn-primary" disabled={fbBusy} onClick={makeFeedback}>{fbBusy ? 'Writing…' : 'Draft feedback'}</button>
            </div>
          ) : (
            <>
              <textarea
                className="feedback-text" rows={8} value={f.text} aria-label="Feedback message"
                onChange={(e) => setState((s) => ({ ...s, feedback: { ...s.feedback, [submissionId]: { ...f, text: e.target.value, status: 'draft', updatedAt: Date.now() } } }))}
              />
              <div className="row end">
                <button className="btn" disabled={fbBusy} onClick={makeFeedback}>{fbBusy ? 'Writing…' : 'Rewrite'}</button>
                {f.status === 'draft' && (
                  <button className="btn btn-primary" disabled={g.status !== 'approved'} title={g.status !== 'approved' ? 'Approve the grade first' : ''}
                    onClick={() => setState((s) => ({ ...s, feedback: { ...s.feedback, [submissionId]: { ...f, status: 'approved' } } }))}>
                    Approve message
                  </button>
                )}
                {f.status !== 'draft' && (
                  <a className="btn btn-primary" href={mailto}
                    onClick={() => setState((s) => ({ ...s, feedback: { ...s.feedback, [submissionId]: { ...f, status: 'sent' } } }))}>
                    {f.status === 'sent' ? '✓ Sent · send again' : `Email ${student.name.split(' ')[0]}`}
                  </a>
                )}
              </div>
            </>
          )}
          {fbError && <div className="alert">{fbError}</div>}
        </Card>
      )}
    </>
  );
}
