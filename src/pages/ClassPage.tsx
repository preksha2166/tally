import { useState } from 'react';
import { useApp } from '../app/context';
import { Card, Empty, errorText, RanOnBadge } from '../app/ui';
import { classInsights, insightsInput } from '../actions';
import { useStore } from '../store';

export function ClassPage() {
  const { engine } = useApp();
  const assignments = useStore((s) => s.assignments);
  const grades = useStore((s) => s.grades);
  const insights = useStore((s) => s.insights);
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const a = assignments.find((x) => x.id === assignmentId);
  if (!a) return <Empty>No assignments yet.</Empty>;
  const gs = Object.values(grades).filter((g) => g.assignmentId === a.id);
  const ins = insights[a.id];

  async function run() {
    setBusy(true);
    setError('');
    try {
      await classInsights(engine, a!.id);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  return (
    <div className="stack">
      <label className="field inline">
        <span>Assignment</span>
        <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
          {assignments.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
      </label>

      <Card title={`Rubric averages · ${gs.length} graded`}>
        {gs.length === 0 ? <Empty>Grade this assignment first.</Empty> : (
          <ul className="bars">
            {a.rubric.map((r) => {
              const avg = gs.reduce((s, g) => s + (g.items.find((i) => i.itemId === r.id)?.score ?? 0), 0) / gs.length;
              const pct = Math.round((avg / r.points) * 100);
              return (
                <li key={r.id}>
                  <span className="bar-name">{r.name}</span>
                  <div className="skillbar"><div className={`skillbar-fill fill-${pct >= 80 ? 'strong' : pct >= 50 ? 'ok' : 'weak'}`} style={{ width: `${pct}%` }} /><span className="skillbar-label">{avg.toFixed(1)} / {r.points}</span></div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="What to re-teach next class" actions={ins && <RanOnBadge ranOn={ins.ranOn} ms={ins.ms} />}>
        <p className="muted">Cloud Gemini sees only averages and anonymized misconceptions. It never sees student answers or names. If you're offline, Gemini Nano writes it on this laptop instead.</p>
        <details>
          <summary>Show exactly what will be sent</summary>
          <pre className="code">{insightsInput(a.id)}</pre>
        </details>
        <div className="row">
          <button className="btn btn-primary" disabled={busy || gs.length === 0} onClick={run}>{busy ? 'Thinking…' : ins ? 'Refresh insights' : 'Get class insights'}</button>
        </div>
        {error && <div className="alert">{error}</div>}
        {ins && <div className="insights">{ins.text.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>}
      </Card>
    </div>
  );
}
