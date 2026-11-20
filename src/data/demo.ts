import type { Assignment, Student, Submission } from '../types';
import { aliasFor } from '../privacy/pseudonym';

/** Fictional demo class so judges can try TAlly in one click. All names are made up. */

export const DEMO_ASSIGNMENTS: Assignment[] = [
  {
    id: 'hw-recursion',
    title: 'HW 5: Recursive digit sum',
    prompt:
      'Write a recursive Python function digit_sum(n) that returns the sum of the digits of a non-negative integer n (for example, digit_sum(472) == 13). Then state its time complexity and explain why.',
    rubric: [
      { id: 'base', name: 'Base case', points: 3, skill: 'Recursion', criteria: 'Stops when n has one digit (n < 10) or n == 0 and returns the correct value.' },
      { id: 'step', name: 'Recursive step', points: 3, skill: 'Recursion', criteria: 'Calls itself on n // 10 and adds the last digit n % 10.' },
      { id: 'edge', name: 'Edge cases', points: 2, skill: 'Edge cases', criteria: 'Works for n = 0 and rejects (or clearly handles) negative input.' },
      { id: 'complexity', name: 'Complexity', points: 2, skill: 'Complexity analysis', criteria: 'States O(d) or O(log n) time, where d is the number of digits, with a correct reason.' },
    ],
    createdAt: Date.UTC(2026, 10, 10),
  },
  {
    id: 'hw-strings',
    title: 'HW 4: Count the vowels',
    prompt:
      'Write a Python function count_vowels(s) that returns how many vowels (a, e, i, o, u) are in the string s, ignoring case. Include at least two tests with their expected output.',
    rubric: [
      { id: 'loop', name: 'Loop over characters', points: 3, skill: 'Loops', criteria: 'Visits every character of s exactly once and counts vowels correctly.' },
      { id: 'case', name: 'Ignores case', points: 2, skill: 'Edge cases', criteria: 'Counts uppercase vowels too, e.g. by calling lower() or checking "AEIOU".' },
      { id: 'tests', name: 'Tests', points: 2, skill: 'Testing', criteria: 'At least two tests (assert or printed checks) that show the expected output.' },
    ],
    createdAt: Date.UTC(2026, 10, 3),
  },
];

const people: [string, string][] = [
  ['Aarav Mehta', 'mehta.aa@example.edu'],
  ['Sofia Ramirez', 'ramirez.so@example.edu'],
  ['Wei Chen', 'chen.we@example.edu'],
  ['Fatima Khan', 'khan.fa@example.edu'],
  ['Liam OBrien', 'obrien.li@example.edu'],
  ['Priya Nair', 'nair.pr@example.edu'],
];

export const DEMO_STUDENTS: Student[] = people.map(([name, email], i) => ({
  id: `s${i + 1}`,
  name,
  email,
  alias: aliasFor(i),
}));

const recursion: string[] = [
  // Aarav: strong
  `def digit_sum(n):
    if n < 0:
        raise ValueError("n must be non-negative")
    if n < 10:
        return n
    return n % 10 + digit_sum(n // 10)

# Time: O(d) where d is the number of digits, because each call removes one digit.`,
  // Sofia: no base case
  `def digit_sum(n):
    return n % 10 + digit_sum(n // 10)

# It is O(n) because it goes through the number.`,
  // Wei: iterative, not recursive
  `def digit_sum(n):
    total = 0
    while n > 0:
        total += n % 10
        n = n // 10
    return total

# O(log n) since we divide by 10 each time. Works for 0 too.`,
  // Fatima: good recursion, misses negatives and complexity reason
  `def digit_sum(n):
    if n == 0:
        return 0
    return n % 10 + digit_sum(n // 10)

# complexity is O(log n)`,
  // Liam: string trick, weak complexity
  `def digit_sum(n):
    s = str(n)
    if len(s) == 1:
        return int(s)
    return int(s[0]) + digit_sum(int(s[1:]))

# O(1) because numbers are small.`,
  // Priya: mostly right, wrong step
  `def digit_sum(n):
    if n < 10:
        return n
    return n // 10 + digit_sum(n % 10)

# O(d), one call per digit. Negative numbers are not allowed so I didn't check.`,
];

const strings: string[] = [
  `def count_vowels(s):
    count = 0
    for ch in s.lower():
        if ch in "aeiou":
            count += 1
    return count

assert count_vowels("Hello") == 2
assert count_vowels("AEIOU xyz") == 5`,
  `def count_vowels(s):
    count = 0
    for ch in s:
        if ch in "aeiou":
            count += 1
    return count

print(count_vowels("banana"))  # 3`,
  `def count_vowels(s):
    return sum(1 for ch in s.lower() if ch in "aeiou")

assert count_vowels("Python") == 1
assert count_vowels("QUEUE") == 4`,
  `def count_vowels(s):
    count = 0
    for ch in s:
        if ch in "aeiouAEIOU":
            count += 1
    return count

assert count_vowels("Apple") == 2
assert count_vowels("sky") == 0`,
  `def count_vowels(s):
    vowels = 0
    i = 0
    while i < len(s):
        if s[i] in "aeiou":
            vowels += 1
        i += 2
    return vowels`,
  `def count_vowels(s):
    count = 0
    for ch in s.lower():
        if ch in "aeiou":
            count += 1
    return count

assert count_vowels("Education") == 5
assert count_vowels("") == 0`,
];

export const DEMO_SUBMISSIONS: Submission[] = [
  ...recursion.map((text, i) => ({ id: `hw-recursion-s${i + 1}`, assignmentId: 'hw-recursion', studentId: `s${i + 1}`, text })),
  ...strings.map((text, i) => ({ id: `hw-strings-s${i + 1}`, assignmentId: 'hw-strings', studentId: `s${i + 1}`, text })),
];
