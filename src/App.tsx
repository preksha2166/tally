import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { Ctx, type AppCtx } from './app/context';
import { FirebaseEngine } from './ai/engine';
import { DEFAULT_RUNTIME, initFirebase, loadRuntimeConfig } from './firebase';
import { MockEngine } from './dev/mockEngine';
import { isFirebaseConfigured, MOCK_AI } from './config';
import { getState, useStore } from './store';
import { GradePage } from './pages/GradePage';
import { StudentsPage } from './pages/StudentsPage';
import { ClassPage } from './pages/ClassPage';
import { SetupPage } from './pages/SetupPage';
import type { DeviceStatus } from './types';

type Tab = 'grade' | 'students' | 'class' | 'setup';
const TABS: { id: Tab; label: string }[] = [
  { id: 'grade', label: 'Grade' },
  { id: 'students', label: 'Students' },
  { id: 'class', label: 'Class' },
  { id: 'setup', label: 'Setup' },
];

export default function App() {
  const [ctx, setCtx] = useState<Omit<AppCtx, 'refreshDevice' | 'device'> | null>(null);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [bootError, setBootError] = useState('');
  const [tab, setTab] = useState<Tab>('grade');
  const simulate = useStore((s) => s.settings.simulateNoNano);

  useEffect(() => {
    (async () => {
      try {
        const services = initFirebase();
        if (!services && !MOCK_AI) {
          setBootError('not-configured');
          return;
        }
        const cfg = await loadRuntimeConfig(services?.rc ?? null);
        const engine = services
          ? new FirebaseEngine(services.ai, cfg, () => getState().settings.simulateNoNano)
          : new MockEngine();
        let uid: string | null = null;
        if (services) {
          uid = await new Promise<string | null>((resolve) => {
            const stop = onAuthStateChanged(services.auth, (u) => {
              if (u) { stop(); resolve(u.uid); }
            });
            signInAnonymously(services.auth).catch(() => { stop(); resolve(null); });
          });
        }
        setCtx({ engine, cfg: { ...DEFAULT_RUNTIME, ...cfg }, services, uid });
        setDevice(await engine.probe());
      } catch (e) {
        setBootError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const refreshDevice = useCallback(async () => {
    if (ctx) setDevice(await ctx.engine.probe());
  }, [ctx]);

  if (bootError === 'not-configured') return <NotConfigured />;
  if (bootError) return <div className="boot"><p className="alert">Could not start: {bootError}</p></div>;
  if (!ctx) return <div className="boot"><p className="muted">Starting TAlly…</p></div>;

  const local = !simulate && device?.api && device.text === 'available';
  return (
    <Ctx.Provider value={{ ...ctx, device, refreshDevice }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img src="/icon.svg" alt="" width={28} height={28} />
            <span>TAlly</span>
            <span className="tagline">private grading copilot</span>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
                {t.label}
              </button>
            ))}
          </nav>
          <button className={`status ${local ? 'status-local' : 'status-cloud'}`} onClick={() => setTab('setup')} title="On-device AI status">
            {local ? '🔒 Gemini Nano ready' : simulate ? '☁️ Demo: no Nano' : device?.api ? `Nano: ${device.text}` : '☁️ Cloud only (names hidden)'}
            {ctx.engine.kind === 'mock' && <span className="mock-tag">MOCK</span>}
          </button>
        </header>
        <main className="main">
          {tab === 'grade' && <GradePage />}
          {tab === 'students' && <StudentsPage />}
          {tab === 'class' && <ClassPage />}
          {tab === 'setup' && <SetupPage />}
        </main>
      </div>
    </Ctx.Provider>
  );
}

function NotConfigured() {
  return (
    <div className="boot">
      <div className="card">
        <h1>TAlly needs a Firebase project</h1>
        <p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase web config, then restart <code>npm run dev</code>. Steps are in <code>docs/SETUP.md</code>.</p>
        <p className="muted">Just want to look at the UI? Run <code>npm run dev:mock</code>.</p>
        {isFirebaseConfigured ? null : <p className="muted small">No Firebase config found in this build.</p>}
      </div>
    </div>
  );
}
