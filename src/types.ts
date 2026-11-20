/** Core data model. Raw submissions live only in this browser (localStorage). */

export interface RubricItem {
  id: string;
  /** Short name, e.g. "Base case". */
  name: string;
  points: number;
  /** What full credit looks like. */
  criteria: string;
  /** Skill this item measures; skill maps are built from these tags. */
  skill: string;
}

export interface Assignment {
  id: string;
  title: string;
  /** The question students answered. */
  prompt: string;
  rubric: RubricItem[];
  createdAt: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  /** Stable pseudonym used for anything that may reach the cloud, e.g. "Student 07". */
  alias: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  text: string;
}

/** Where inference actually happened, from Firebase AI Logic's `response.inferenceSource`. */
export type RanOn = 'on_device' | 'in_cloud';

export interface ItemGrade {
  itemId: string;
  score: number;
  /** Why points were lost (or "Meets the criteria."). */
  why: string;
}

export type GradeStatus = 'suggested' | 'approved';

export interface Grade {
  submissionId: string;
  assignmentId: string;
  studentId: string;
  items: ItemGrade[];
  /** The main misunderstanding behind the mistakes, in one sentence. */
  misconception: string;
  summary: string;
  status: GradeStatus;
  ranOn: RanOn;
  /** private = raw work, on-device only; pseudonymized = names/IDs replaced before a possible cloud call. */
  lane: 'private' | 'pseudonymized';
  ms: number;
  gradedAt: number;
}

export type FeedbackStatus = 'draft' | 'approved' | 'sent';

export interface Feedback {
  submissionId: string;
  studentId: string;
  /** Message to the student, with their real name filled in locally. */
  text: string;
  status: FeedbackStatus;
  ranOn: RanOn;
  updatedAt: number;
}

/**
 * Second chance for a low score. It only opens after the TA meets the student in person:
 * needs-meeting → met → question-ready → sent → graded.
 */
export type MakeupStatus = 'needs-meeting' | 'met' | 'question-ready' | 'sent' | 'graded';

export interface MakeupGrade {
  items: ItemGrade[];
  misconception: string;
  ranOn: RanOn;
  lane: 'private' | 'pseudonymized';
  ms: number;
  approved: boolean;
}

export interface Makeup {
  /** The original, low-scoring submission. */
  submissionId: string;
  assignmentId: string;
  studentId: string;
  status: MakeupStatus;
  /** What the TA learned in the meeting. Private; names are replaced before any AI call. */
  notes: string;
  metAt?: number;
  /** The new question, written by the AI and edited by the TA. */
  question?: string;
  /** Rubric criteria rewritten for the new question, by rubric item id. Same items and points. */
  criteria?: Record<string, string>;
  questionRanOn?: RanOn;
  /** The student's make-up answer, pasted in by the TA. Stays in this browser. */
  answer?: string;
  grade?: MakeupGrade;
}

export type SkillLevel = 'strong' | 'ok' | 'weak';

export interface SkillScore {
  skill: string;
  earned: number;
  possible: number;
  level: SkillLevel;
}

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface DeviceStatus {
  /** Chrome's on-device Prompt API (`LanguageModel`) exists in this browser. */
  api: boolean;
  text: Availability;
}

export interface ClassInsight {
  text: string;
  ranOn: RanOn;
  ms: number;
  /** The exact anonymized summary that was sent. */
  sent: string;
  createdAt: number;
}
