import type { ReactNode } from 'react';
import type { RanOn, SkillLevel } from '../types';

export function RanOnBadge({ ranOn, ms, lane }: { ranOn: RanOn; ms?: number; lane?: 'private' | 'pseudonymized' }) {
  const device = ranOn === 'on_device';
  return (
    <span className={`badge ${device ? 'badge-device' : 'badge-cloud'}`} title="Reported by Firebase AI Logic (response.inferenceSource)">
      <span aria-hidden="true">{device ? '🔒' : '☁️'}</span>
      {device ? 'On this device · Gemini Nano' : lane === 'pseudonymized' || lane === undefined ? 'Cloud · names hidden' : 'Cloud'}
      {ms !== undefined && <span className="badge-ms">{(ms / 1000).toFixed(1)}s</span>}
    </span>
  );
}

export function LevelChip({ level }: { level: SkillLevel }) {
  const label = level === 'strong' ? 'Strong' : level === 'ok' ? 'Getting there' : 'Needs help';
  return <span className={`chip chip-${level}`}>{label}</span>;
}

export function SkillBar({ earned, possible, level }: { earned: number; possible: number; level: SkillLevel }) {
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  return (
    <div className="skillbar" role="img" aria-label={`${pct} percent`}>
      <div className={`skillbar-fill fill-${level}`} style={{ width: `${pct}%` }} />
      <span className="skillbar-label">{pct}%</span>
    </div>
  );
}

export function Card({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/app-check|appCheck|401|403/i.test(msg)) return `Cloud AI was refused (App Check). See docs/SETUP.md, step 4. (${msg})`;
  if (/fetch|network|Failed to fetch/i.test(msg)) return 'No internet connection, so the cloud step could not run. On-device grading still works.';
  return msg;
}
