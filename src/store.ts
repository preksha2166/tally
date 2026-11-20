import { useSyncExternalStore } from 'react';
import type { Assignment, ClassInsight, Feedback, Grade, Makeup, Student, Submission } from './types';
import { DEMO_ASSIGNMENTS, DEMO_STUDENTS, DEMO_SUBMISSIONS } from './data/demo';

/**
 * Local-first store. Everything here lives in this browser only (localStorage):
 * raw submissions and real names never leave the device through the store.
 */

export type CloudFallback = 'ask' | 'allow' | 'never';

export interface Settings {
  /** What to do when Gemini Nano is not available on this device. */
  cloudFallback: CloudFallback;
  /** Demo switch: behave as if this browser had no on-device model. */
  simulateNoNano: boolean;
  /** Approved grades below this share of the points (0.3 = under 3/10) need an in-person check-in. */
  makeupThreshold: number;
  /** A make-up can raise the score to at most this share of the points. */
  makeupCap: number;
}

export interface Ledger {
  onDevice: number;
  inCloud: number;
  /** Cloud calls whose input had names and IDs replaced first. */
  pseudonymizedCloud: number;
  /** Raw student work sent to the cloud. Should stay 0. */
  rawUploads: number;
}

export interface State {
  assignments: Assignment[];
  students: Student[];
  submissions: Submission[];
  grades: Record<string, Grade>;
  feedback: Record<string, Feedback>;
  insights: Record<string, ClassInsight>;
  /** Make-up work, keyed by the original submission id. */
  makeups: Record<string, Makeup>;
  settings: Settings;
  ledger: Ledger;
}

const KEY = 'tally.state.v1';

export function demoState(): State {
  return {
    assignments: DEMO_ASSIGNMENTS,
    students: DEMO_STUDENTS,
    submissions: DEMO_SUBMISSIONS,
    grades: {},
    feedback: {},
    insights: {},
    makeups: {},
    settings: { cloudFallback: 'ask', simulateNoNano: false, makeupThreshold: 0.3, makeupCap: 0.7 },
    ledger: { onDevice: 0, inCloud: 0, pseudonymizedCloud: 0, rawUploads: 0 },
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<State>;
      const base = demoState();
      // Merge settings too, so data saved by an older version gets the new defaults.
      return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
    }
  } catch {
    // Storage blocked or corrupt: start from the demo class.
  }
  return demoState();
}

let state: State = load();
const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(update: (s: State) => State): void {
  state = update(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or private mode: keep working in memory.
  }
  listeners.forEach((l) => l());
}

export function resetToDemo(): void {
  setState(() => demoState());
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

export function countCall(ranOn: 'on_device' | 'in_cloud', pseudonymized: boolean): void {
  setState((s) => ({
    ...s,
    ledger: {
      ...s.ledger,
      onDevice: s.ledger.onDevice + (ranOn === 'on_device' ? 1 : 0),
      inCloud: s.ledger.inCloud + (ranOn === 'in_cloud' ? 1 : 0),
      pseudonymizedCloud: s.ledger.pseudonymizedCloud + (ranOn === 'in_cloud' && pseudonymized ? 1 : 0),
    },
  }));
}
