# TAlly: a private grading copilot for TAs

TAlly grades student work **on the TA's own laptop** with Gemini Nano. It explains **why** each student lost points, builds a **strengths and weak-areas map** for every student, and drafts a **personal feedback message** that shows each student what they should have written. Students who score low get a **make-up question** after they meet the TA in person. With Nano, the cloud only ever sees anonymized, class-wide patterns.

Built for **#BuildHybridAI 2026** with **Firebase AI Logic hybrid inference** (Web / Chrome).

## The problem
TAs and teachers spend hours grading, and students get a number with little explanation. AI could help, but student work is protected (FERPA in the US), and many schools forbid pasting it into cloud chatbots. On-device AI removes that blocker. Hybrid inference keeps the app useful on laptops that can't run a local model.

## What it does
| Screen | What the TA gets |
|---|---|
| **Grade** | Suggested score per rubric item, a reason for each lost point, and the student's main misunderstanding. Every grade is editable, and nothing counts until the TA approves it. |
| **Feedback** | A personal message to each student: one thing they did well, what they should have written and why, and a next step. The TA edits and approves it, then emails it. |
| **Students** | **Check-ins and make-up work** for low scores (below), skill maps (strong / getting there / needs help) built from rubric scores across assignments, and a **"Students to talk to"** list with talking points. |
| **Class** | Rubric averages, plus "what to re-teach next class" from cloud Gemini using only averages and anonymized misconceptions. |

### Check-ins and make-up work
A low score opens a second chance, but only after the TA has talked to the student. It lives in a card at the top of **Students**:

1. **Who needs a check-in:** students whose **approved** score is under 30%, so 2/10 qualifies and 3/10 doesn't. An AI suggestion the TA hasn't approved never puts anyone on the list.
2. **Meet:** the TA writes private notes and clicks **Mark as met in person**. The make-up can't be created before that.
3. **Make-up question:** the AI writes a new question that tests the same skills, plus what full credit means on each rubric item. It works from the original question, the rubric, the points lost and the TA's notes, with names hidden. **The student's answer is never sent.** The TA edits the question, then approves and emails it.
4. **Grade the answer:** the TA pastes the student's answer. It's graded against the new question, with the same rubric points and the same privacy rules as any other answer.
5. **Final score:** the better of the two, with the make-up capped at 70%. The card shows, for example, "Original 2/10 → make-up 9/10 (capped at 7) → counts as 7/10". A make-up never lowers a score, and the TA approves the result.

Both percentages can be changed on the card. The rules are plain arithmetic (`src/makeup.ts`), so a TA can predict every outcome.

## How it uses Firebase AI Logic
Each task uses a different `InferenceMode` on purpose (`src/ai/engine.ts`, `src/actions.ts`):

| Task | Mode | What the model sees |
|---|---|---|
| Grade a raw answer (assignment or make-up) | `ONLY_ON_DEVICE` | Raw answer, on the laptop only |
| Grade when Nano is missing (TA consents) | `PREFER_ON_DEVICE` | Answer with names, emails and IDs replaced by aliases ("Student 03") |
| Draft personal feedback | `PREFER_ON_DEVICE` | Aliased text; the real name is put back on the laptop |
| Write a make-up question | `PREFER_ON_DEVICE` | Original question, rubric, points lost and the TA's meeting notes, aliased. Never the student's answer |
| Class insights | `PREFER_IN_CLOUD` | Averages and anonymized misconceptions only; falls back to Nano when offline |

- **Structured output on both sides:** the same JSON Schema, built from the rubric, goes to Nano (`responseConstraint`) and to cloud Gemini (`responseJsonSchema`). Every rubric item is a required key, so the model has to answer all of them. For each item it first copies the line it's judging, then gives a verdict (full / partial / none), then a reason and a score. Code makes the score match the verdict and clamps it (`src/ai/schema.ts`). Make-up questions use their own schema, built the same way.
- **Every answer shows where it ran,** using `response.inferenceSource`.
- **A privacy gate we added after reading the SDK source:** if Chrome's `LanguageModel` API is missing, the SDK creates no on-device adapter, and even `ONLY_ON_DEVICE` requests go to the cloud. So TAlly checks `LanguageModel.availability()` itself before handing raw work to the SDK (`src/ai/device.ts`).
- **Skill levels are plain arithmetic** over rubric scores, not AI guesses, so every "weak area" traces back to graded items (`src/skills.ts`).

Other Firebase products: **App Check** (Fraud Defense, formerly reCAPTCHA Enterprise, with a debug token on localhost), **Authentication** (anonymous), **Remote Config** (cloud model names and the on-device length limit), **Firestore** (rules in `firestore.rules`), **Hosting**.

## Privacy model
- Raw submissions and real names stay in the browser (localStorage).
- Anything that might reach the cloud goes through roster-based pseudonymization first (`src/privacy/pseudonym.ts`).
- Make-up questions are written without the student's answer. The AI gets the original question, the rubric, the points lost and the TA's meeting notes, with names hidden.
- When Nano isn't available, the TA chooses **Ask me / Always allow (names hidden) / Never** and can preview exactly what would be sent.
- **Setup** shows a counter of on-device calls, cloud calls, and raw answers uploaded (always 0).
- The AI only suggests. A person approves every grade, every message and every make-up.

## Run it
See **[docs/SETUP.md](docs/SETUP.md)** for Firebase setup. Quick start:
```
npm install
npm run dev        # needs .env.local (see .env.example)
npm run dev:mock   # UI only, fake AI, no Firebase
npm test
```
A made-up demo class (6 students, 2 Python assignments) loads on first run.

## License
Apache 2.0. See [LICENSE](LICENSE).
