import { useState } from 'react';
import { useApp } from '../app/context';
import { Card, errorText } from '../app/ui';
import { aliasFor } from '../privacy/pseudonym';
import { resetToDemo, setState, useStore, type CloudFallback } from '../store';
import type { Assignment, RubricItem, Student } from '../types';

const uid = () => Math.random().toString(36).slice(2, 9);

export function SetupPage() {
  return (
    <div className="stack">
      <DeviceCard />
      <PrivacyCard />
      <AssignmentCard />
      <RosterCard />
      <SubmissionCard />
      <Card title="Demo data">
        <div className="row">
          <p className="muted">Reset to the made-up demo class (6 students, 2 assignments). This deletes your grades on this browser.</p>
          <button className="btn" onClick={() => confirm('Reset everything to the demo class?') && resetToDemo()}>Reset demo</button>
        </div>
      </Card>
    </div>
  );
}

function DeviceCard() {
  const { engine, device, refreshDevice, cfg, services } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function download() {
    setError('');
    setProgress(0);
    try {
      await engine.prepareDevice((f) => setProgress(f));
    } catch (e) {
      setError(errorText(e));
    }
    setProgress(null);
    await refreshDevice();
  }

  const status = !device ? 'Checking…' : !device.api ? 'Not supported in this browser' : device.text;
  return (
    <Card title="On-device AI (Gemini Nano)">
      <dl className="facts">
        <dt>Status</dt><dd><strong>{status}</strong></dd>
        <dt>AI engine</dt><dd>{engine.kind === 'mock' ? 'Mock (dev only, no Firebase)' : 'Firebase AI Logic hybrid inference'}</dd>
        <dt>App Check</dt><dd>{services ? (services.appCheck ? 'On' : 'Missing site key') : 'n/a'}</dd>
        <dt>Cloud models</dt><dd>{cfg.cloudGradeModel} · {cfg.cloudInsightsModel} <span className="muted">(from {cfg.source})</span></dd>
      </dl>
      {device?.api && (device.text === 'downloadable' || device.text === 'downloading') && (
        <div className="row">
          <button className="btn btn-primary" onClick={download} disabled={progress !== null}>
            {progress !== null ? `Downloading ${Math.round(progress * 100)}%` : 'Download Gemini Nano (one time)'}
          </button>
        </div>
      )}
      {device && !device.api && (
        <p className="muted">To grade privately, open TAlly in desktop Chrome 139+ and turn on <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, then restart Chrome. Without it, TAlly can still grade in the cloud with names hidden.</p>
      )}
      <div className="row"><button className="btn btn-small" onClick={refreshDevice}>Check again</button></div>
      {error && <div className="alert">{error}</div>}
    </Card>
  );
}

function PrivacyCard() {
  const settings = useStore((s) => s.settings);
  const ledger = useStore((s) => s.ledger);
  const set = (patch: Partial<typeof settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const options: { v: CloudFallback; label: string; hint: string }[] = [
    { v: 'ask', label: 'Ask me each time', hint: 'Recommended' },
    { v: 'allow', label: 'Always allow, with names hidden', hint: '' },
    { v: 'never', label: 'Never use the cloud for student work', hint: 'Strictest' },
  ];
  return (
    <Card title="Privacy">
      <div className="tiles">
        <div className="tile"><span className="tile-n">{ledger.onDevice}</span><span>AI calls on this device</span></div>
        <div className="tile"><span className="tile-n">{ledger.inCloud}</span><span>Cloud calls (names hidden)</span></div>
        <div className="tile tile-good"><span className="tile-n">{ledger.rawUploads}</span><span>Raw answers uploaded</span></div>
      </div>
      <fieldset className="radios">
        <legend>When Gemini Nano isn't available</legend>
        {options.map((o) => (
          <label key={o.v}>
            <input type="radio" name="fallback" checked={settings.cloudFallback === o.v} onChange={() => set({ cloudFallback: o.v })} />
            {o.label} {o.hint && <span className="muted small">· {o.hint}</span>}
          </label>
        ))}
      </fieldset>
      <label className="switch">
        <input type="checkbox" checked={settings.simulateNoNano} onChange={(e) => set({ simulateNoNano: e.target.checked })} />
        Demo: act as if this laptop has no Gemini Nano (forces the cloud path)
      </label>
    </Card>
  );
}

function AssignmentCard() {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [rows, setRows] = useState<RubricItem[]>([{ id: uid(), name: '', points: 2, criteria: '', skill: '' }]);
  const [msg, setMsg] = useState('');
  const edit = (id: string, patch: Partial<RubricItem>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  function save() {
    const rubric = rows.filter((r) => r.name.trim() && r.criteria.trim()).map((r) => ({ ...r, skill: r.skill.trim() || r.name.trim() }));
    if (!title.trim() || !prompt.trim() || !rubric.length) {
      setMsg('Add a title, the question, and at least one rubric item.');
      return;
    }
    const a: Assignment = { id: `a-${uid()}`, title: title.trim(), prompt: prompt.trim(), rubric, createdAt: Date.now() };
    setState((s) => ({ ...s, assignments: [a, ...s.assignments] }));
    setTitle(''); setPrompt(''); setRows([{ id: uid(), name: '', points: 2, criteria: '', skill: '' }]);
    setMsg(`Added "${a.title}".`);
  }

  return (
    <Card title="Add an assignment">
      <label className="field"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HW 6: Binary search" /></label>
      <label className="field"><span>Question students answered</span><textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <table className="rubric-edit">
        <thead><tr><th>Rubric item</th><th>Points</th><th>Full credit means…</th><th>Skill</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><input value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} placeholder="Base case" aria-label="Rubric item name" /></td>
              <td><input type="number" min={0.5} step={0.5} value={r.points} onChange={(e) => edit(r.id, { points: Number(e.target.value) || 1 })} aria-label="Points" /></td>
              <td><input value={r.criteria} onChange={(e) => edit(r.id, { criteria: e.target.value })} placeholder="Stops when…" aria-label="Criteria" /></td>
              <td><input value={r.skill} onChange={(e) => edit(r.id, { skill: e.target.value })} placeholder="Recursion" aria-label="Skill" /></td>
              <td><button className="btn btn-small" aria-label="Remove row" onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => setRows((r) => [...r, { id: uid(), name: '', points: 2, criteria: '', skill: '' }])}>+ Rubric item</button>
        <button className="btn btn-primary" onClick={save}>Save assignment</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </Card>
  );
}

function RosterCard() {
  const students = useStore((s) => s.students);
  const [text, setText] = useState(() => students.map((s) => `${s.name}, ${s.email}`).join('\n'));
  const [msg, setMsg] = useState('');
  function save() {
    const list: Student[] = text
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((line, i) => {
        const [name, email = ''] = line.split(',').map((x) => x.trim());
        const existing = students.find((s) => s.name === name || (email && s.email === email));
        return { id: existing?.id ?? `s-${uid()}`, name, email, alias: aliasFor(i) };
      });
    setState((s) => ({ ...s, students: list }));
    setMsg(`Saved ${list.length} students.`);
  }
  return (
    <Card title="Class roster">
      <p className="muted">One student per line: <code>Name, email</code>. Each student gets an alias ("Student 01") that is used whenever text might reach the cloud.</p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Roster" />
      <div className="row"><button className="btn btn-primary" onClick={save}>Save roster</button>{msg && <span className="muted">{msg}</span>}</div>
    </Card>
  );
}

function SubmissionCard() {
  const assignments = useStore((s) => s.assignments);
  const students = useStore((s) => s.students);
  const [aId, setAId] = useState(assignments[0]?.id ?? '');
  const [sId, setSId] = useState(students[0]?.id ?? '');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  function upsert(studentId: string, body: string) {
    const id = `${aId}-${studentId}`;
    setState((s) => {
      const grades = { ...s.grades };
      const feedback = { ...s.feedback };
      delete grades[id];
      delete feedback[id];
      return { ...s, grades, feedback, submissions: [...s.submissions.filter((x) => x.id !== id), { id, assignmentId: aId, studentId, text: body }] };
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files) return;
    let n = 0;
    const missed: string[] = [];
    for (const f of Array.from(files)) {
      const key = f.name.toLowerCase();
      const st = students.find((s) => key.includes(s.email.split('@')[0].toLowerCase()) || s.name.toLowerCase().split(' ').every((p) => key.includes(p)));
      if (!st) { missed.push(f.name); continue; }
      upsert(st.id, await f.text());
      n++;
    }
    setMsg(`Imported ${n} file(s).${missed.length ? ` No student matched: ${missed.join(', ')}` : ''}`);
  }

  return (
    <Card title="Add submissions">
      <div className="row">
        <label className="field inline"><span>Assignment</span>
          <select value={aId} onChange={(e) => setAId(e.target.value)}>{assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</select>
        </label>
        <label className="field inline"><span>Student</span>
          <select value={sId} onChange={(e) => setSId(e.target.value)}>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
      </div>
      <textarea rows={6} className="mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the student's answer or code" aria-label="Submission text" />
      <div className="row">
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => { upsert(sId, text); setText(''); setMsg('Saved. It stays in this browser only.'); }}>Save submission</button>
        <label className="btn">Upload files…<input type="file" multiple hidden accept=".txt,.py,.java,.js,.ts,.c,.cpp,.md" onChange={(e) => onFiles(e.target.files)} /></label>
        {msg && <span className="muted">{msg}</span>}
      </div>
      <p className="muted small">File names should contain the student's name or email name, e.g. <code>chen.we_hw5.py</code>.</p>
    </Card>
  );
}
