import type { Student } from '../types';

/**
 * Deterministic de-identification for anything that may leave the device.
 * The roster is known, so names, emails and IDs can be swapped reliably
 * for aliases ("Student 07") and swapped back locally afterwards.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/** University-style IDs such as 001234567 (7 to 10 digits). */
const ID_RE = /\b\d{7,10}\b/g;

export interface PseudonymResult {
  text: string;
  replaced: number;
}

export function pseudonymize(text: string, roster: Student[]): PseudonymResult {
  let out = text;
  let replaced = 0;
  const count = (re: RegExp, sub: string | ((m: string) => string)) => {
    out = out.replace(re, (m) => {
      replaced++;
      return typeof sub === 'string' ? sub : sub(m);
    });
  };

  // Full names first, then each name part (longest first) so "Ana Li" is not half-replaced.
  const parts: { token: string; alias: string }[] = [];
  for (const s of roster) {
    parts.push({ token: s.name, alias: s.alias });
    if (s.email) parts.push({ token: s.email, alias: `${s.alias} (email)` });
    for (const p of s.name.split(/\s+/)) if (p.length >= 3) parts.push({ token: p, alias: s.alias });
  }
  parts.sort((a, b) => b.token.length - a.token.length);
  for (const { token, alias } of parts) {
    count(new RegExp(`(?<![\\w@])${escapeRe(token)}(?![\\w@])`, 'gi'), alias);
  }
  count(EMAIL_RE, '[email]');
  count(ID_RE, '[id]');
  return { text: out, replaced };
}

/** Put real names back into text written about an alias. Runs only on the device. */
export function reidentify(text: string, roster: Student[]): string {
  let out = text;
  for (const s of [...roster].sort((a, b) => b.alias.length - a.alias.length)) {
    const first = s.name.split(/\s+/)[0] ?? s.name;
    out = out.replace(new RegExp(`\\b${escapeRe(s.alias)}\\b`, 'g'), first);
  }
  return out;
}

export function aliasFor(index: number): string {
  return `Student ${String(index + 1).padStart(2, '0')}`;
}
