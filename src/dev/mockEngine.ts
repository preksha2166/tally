import type { Engine, GradeOutcome, MakeupOutcome, TextOutcome } from '../ai/engine';
import type { Assignment, DeviceStatus, Grade } from '../types';

/**
 * DEV ONLY (npm run dev:mock). A fake engine so the UI can be built without a Firebase
 * project. It grades with simple keyword rules. Production builds use FirebaseEngine.
 */

const RULES: Record<string, { test: (t: string) => boolean; miss: string; hit: string }> = {
  base: { test: (t) => /n\s*<\s*10|n\s*==\s*0|len\(s\)\s*==\s*1/.test(t) && (t.match(/digit_sum\(/g) ?? []).length >= 2, hit: 'Clear base case that stops the recursion.', miss: 'No base case, so the function never stops calling itself.' },
  step: { test: (t) => /n\s*%\s*10\s*\+\s*digit_sum\(\s*n\s*\/\/\s*10\s*\)/.test(t), hit: 'Recursive step adds n % 10 and recurses on n // 10.', miss: 'The recursive step does not add the last digit and recurse on the rest (n % 10 + digit_sum(n // 10)).' },
  edge: { test: (t) => /n\s*<\s*0|ValueError/.test(t), hit: 'Handles negative input.', miss: 'Does not handle negative input, which the question rules out explicitly.' },
  complexity: { test: (t) => /O\((d|log n)\)[^\n]*(because|since|each|one call|per digit)/i.test(t), hit: 'Correct complexity with a reason.', miss: 'Complexity is missing, wrong, or has no reason (it is O(d) because each call removes one digit).' },
  loop: { test: (t) => /for\s+\w+\s+in\s+s|sum\(1 for/.test(t), hit: 'Visits every character once.', miss: 'The loop skips characters (i += 2), so some vowels are never counted.' },
  case: { test: (t) => /lower\(\)|AEIOU/.test(t), hit: 'Counts uppercase vowels too.', miss: 'Only lowercase vowels are counted, so "Apple" gives 1 instead of 2.' },
  tests: { test: (t) => (t.match(/assert|print\(/g) ?? []).length >= 2, hit: 'Has at least two tests.', miss: 'Fewer than two tests with expected output.' },
};

const MAKEUP: Record<string, { question: string; criteria: Record<string, string> }> = {
  'hw-recursion': {
    question: 'Write a recursive Python function count_digits(n) that returns how many digits a non-negative integer n has (count_digits(472) == 3, count_digits(0) == 1). Raise ValueError for negative n. Then state its time complexity and explain why.',
    criteria: {
      base: 'Stops when n < 10 and returns 1.',
      step: 'Returns 1 + count_digits(n // 10).',
      edge: 'Returns 1 for n = 0 and raises ValueError for negative n.',
      complexity: 'States O(d) or O(log n) because each call removes one digit.',
    },
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MOCK_DEVICE_KEY = 'tally.mock.nano';

export class MockEngine implements Engine {
  readonly kind = 'mock' as const;

  async probe(): Promise<DeviceStatus> {
    const v = localStorage.getItem(MOCK_DEVICE_KEY) ?? 'available';
    return { api: true, text: v === 'downloadable' ? 'downloadable' : 'available' };
  }

  async prepareDevice(onProgress: (f: number) => void): Promise<void> {
    for (let i = 1; i <= 10; i++) {
      await sleep(120);
      onProgress(i / 10);
    }
    localStorage.setItem(MOCK_DEVICE_KEY, 'available');
  }

  async grade(a: Assignment, _alias: string, answer: string, lane: 'private' | 'pseudonymized'): Promise<GradeOutcome> {
    await sleep(700 + Math.random() * 600);
    const items = a.rubric.map((r) => {
      const rule = RULES[r.id];
      const ok = rule ? rule.test(answer) : answer.length > 40;
      return { itemId: r.id, score: ok ? r.points : 0, why: rule ? (ok ? rule.hit : rule.miss) : 'Reviewed.' };
    });
    const firstMiss = items.find((i) => i.score === 0);
    return {
      items,
      misconception: firstMiss ? firstMiss.why : 'None',
      summary: firstMiss ? 'Partly correct; see the missed rubric items.' : 'Meets every rubric item.',
      ranOn: lane === 'private' ? 'on_device' : 'in_cloud',
      ms: 900,
    };
  }

  async feedback(a: Assignment, g: Grade, alias: string): Promise<TextOutcome> {
    await sleep(600);
    const missed = g.items.filter((i) => i.score < (a.rubric.find((r) => r.id === i.itemId)?.points ?? 0));
    const good = g.items.find((i) => !missed.includes(i));
    const body = missed.length
      ? missed.map((m) => `For "${a.rubric.find((r) => r.id === m.itemId)?.name}": ${m.why}`).join(' ')
      : 'You met every part of the rubric.';
    return {
      text: `Hi ${alias}, ${good ? `nice work: ${good.why.toLowerCase()} ` : ''}${body} Next step: rewrite the missed part and test it on two inputs.`,
      ranOn: 'on_device',
      ms: 600,
    };
  }

  async makeupQuestion(a: Assignment): Promise<MakeupOutcome> {
    await sleep(800);
    const canned = MAKEUP[a.id];
    return {
      question: canned?.question ?? `(Mock mode) A new question on the same skills as "${a.title}".`,
      criteria: Object.fromEntries(a.rubric.map((r) => [r.id, canned?.criteria[r.id] ?? r.criteria])),
      ranOn: 'on_device',
      ms: 800,
    };
  }

  async insights(payload: string): Promise<TextOutcome> {
    await sleep(900);
    const n = payload.match(/Students graded: (\d+)/)?.[1] ?? '?';
    return {
      text: `- Several of the ${n} students lost points on the lowest-scoring rubric items listed.\n- (Mock mode) Connect Firebase to get real class insights from Gemini.\n- 10-minute plan: live-code one wrong answer, ask the class to find the bug, then fix it together.`,
      ranOn: 'in_cloud',
      ms: 900,
    };
  }
}
