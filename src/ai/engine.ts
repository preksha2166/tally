import { getGenerativeModel, InferenceMode, type AI, type GenerativeModel } from 'firebase/ai';
import type { Assignment, DeviceStatus, Grade, RanOn } from '../types';
import { assertDeviceReady, DEVICE_CREATE_OPTIONS, probeDevice } from './device';
import { FEEDBACK_SYSTEM, feedbackPrompt, GRADE_SYSTEM, gradePrompt, INSIGHTS_SYSTEM, MAKEUP_SYSTEM, makeupPrompt } from './prompts';
import { extractJson, gradeSchema, makeupSchema, normalizeGrade, normalizeMakeup, type ParsedGrade, type ParsedMakeup } from './schema';

export interface RuntimeConfig {
  cloudGradeModel: string;
  cloudFeedbackModel: string;
  cloudInsightsModel: string;
  /** Answers longer than this skip Nano (its context is about 9K tokens). */
  maxDeviceChars: number;
}

export interface GradeOutcome extends ParsedGrade {
  ranOn: RanOn;
  ms: number;
}

export interface TextOutcome {
  text: string;
  ranOn: RanOn;
  ms: number;
}

/** Everything the UI needs from the AI layer. Implemented by Firebase AI Logic, or by a fake in dev mock mode. */
export interface Engine {
  readonly kind: 'firebase' | 'mock';
  probe(): Promise<DeviceStatus>;
  /** Must run from a click: it may start Chrome's one-time Gemini Nano download. */
  prepareDevice(onProgress: (fraction: number) => void): Promise<void>;
  /**
   * private: raw answer, ONLY_ON_DEVICE, behind our own availability gate.
   * pseudonymized: names/IDs already replaced by the caller, PREFER_ON_DEVICE (cloud if no Nano).
   */
  grade(a: Assignment, alias: string, answer: string, lane: 'private' | 'pseudonymized'): Promise<GradeOutcome>;
  /** PREFER_ON_DEVICE. Input uses the alias only; the real name is put back locally afterwards. */
  feedback(a: Assignment, g: Grade, alias: string, answer: string): Promise<TextOutcome>;
  /** PREFER_IN_CLOUD with anonymized aggregates only; falls back to Nano when offline. */
  insights(payload: string): Promise<TextOutcome>;
  /** PREFER_ON_DEVICE. Input: question, rubric, lost points and the TA's notes, names replaced. Never the answer. */
  makeupQuestion(a: Assignment, g: Grade, notes: string): Promise<MakeupOutcome>;
}

export interface MakeupOutcome extends ParsedMakeup {
  ranOn: RanOn;
  ms: number;
}

const ranOnOf = (src: string | undefined): RanOn => (src === 'on_device' ? 'on_device' : 'in_cloud');

export class FirebaseEngine implements Engine {
  readonly kind = 'firebase' as const;
  private cache = new Map<string, GenerativeModel>();

  constructor(
    private ai: AI,
    private cfg: RuntimeConfig,
    /** Demo switch: when true, every non-private call is forced to the cloud (ONLY_IN_CLOUD). */
    private simulateNoNano: () => boolean = () => false,
  ) {}

  /** Mode for calls whose input is already de-identified. */
  private sharedMode(preferred: InferenceMode): InferenceMode {
    return this.simulateNoNano() ? InferenceMode.ONLY_IN_CLOUD : preferred;
  }

  private model(key: string, make: () => GenerativeModel): GenerativeModel {
    let m = this.cache.get(key);
    if (!m) {
      m = make();
      this.cache.set(key, m);
    }
    return m;
  }

  private gradeModel(a: Assignment, lane: 'private' | 'pseudonymized'): GenerativeModel {
    const schema = gradeSchema(a);
    const mode = lane === 'private' ? InferenceMode.ONLY_ON_DEVICE : this.sharedMode(InferenceMode.PREFER_ON_DEVICE);
    return this.model(`grade:${mode}:${a.id}:${a.rubric.map((r) => `${r.id}/${r.points}/${r.criteria}`).join('|')}`, () =>
      getGenerativeModel(this.ai, {
        mode,
        onDeviceParams: {
          createOptions: {
            ...DEVICE_CREATE_OPTIONS,
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: GRADE_SYSTEM }] }],
          },
          promptOptions: { responseConstraint: schema },
        },
        inCloudParams: {
          model: this.cfg.cloudGradeModel,
          systemInstruction: GRADE_SYSTEM,
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2 },
        },
      }),
    );
  }

  probe(): Promise<DeviceStatus> {
    return probeDevice();
  }

  async prepareDevice(onProgress: (fraction: number) => void): Promise<void> {
    const m = getGenerativeModel(this.ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: DEVICE_CREATE_OPTIONS },
    });
    await m.initializeDeviceModel(onProgress);
  }

  async grade(a: Assignment, alias: string, answer: string, lane: 'private' | 'pseudonymized'): Promise<GradeOutcome> {
    if (lane === 'private') await assertDeviceReady();
    const t0 = performance.now();
    const res = await this.gradeModel(a, lane).generateContent(gradePrompt(a, alias, answer));
    const ranOn = ranOnOf(res.response.inferenceSource);
    if (lane === 'private' && ranOn !== 'on_device') {
      // Unreachable while the gate above holds; surfaced loudly if the SDK ever behaves differently.
      console.error('Privacy gate violated: private grading did not run on-device.');
    }
    return { ...normalizeGrade(extractJson(res.response.text()), a), ranOn, ms: performance.now() - t0 };
  }

  async feedback(a: Assignment, g: Grade, alias: string, answer: string): Promise<TextOutcome> {
    const mode = this.sharedMode(InferenceMode.PREFER_ON_DEVICE);
    const m = this.model(`feedback:${mode}`, () =>
      getGenerativeModel(this.ai, {
        mode,
        onDeviceParams: {
          createOptions: {
            ...DEVICE_CREATE_OPTIONS,
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: FEEDBACK_SYSTEM }] }],
          },
        },
        inCloudParams: {
          model: this.cfg.cloudFeedbackModel,
          systemInstruction: FEEDBACK_SYSTEM,
          generationConfig: { temperature: 0.5 },
        },
      }),
    );
    const t0 = performance.now();
    const res = await m.generateContent(feedbackPrompt(a, g, alias, answer));
    return { text: res.response.text().trim(), ranOn: ranOnOf(res.response.inferenceSource), ms: performance.now() - t0 };
  }

  async insights(payload: string): Promise<TextOutcome> {
    const mode = this.sharedMode(InferenceMode.PREFER_IN_CLOUD);
    const m = this.model(`insights:${mode}`, () =>
      getGenerativeModel(this.ai, {
        mode,
        onDeviceParams: {
          createOptions: {
            ...DEVICE_CREATE_OPTIONS,
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: INSIGHTS_SYSTEM }] }],
          },
        },
        inCloudParams: {
          model: this.cfg.cloudInsightsModel,
          systemInstruction: INSIGHTS_SYSTEM,
          generationConfig: { temperature: 0.4 },
        },
      }),
    );
    const t0 = performance.now();
    const res = await m.generateContent(payload);
    return { text: res.response.text().trim(), ranOn: ranOnOf(res.response.inferenceSource), ms: performance.now() - t0 };
  }

  async makeupQuestion(a: Assignment, g: Grade, notes: string): Promise<MakeupOutcome> {
    const mode = this.sharedMode(InferenceMode.PREFER_ON_DEVICE);
    const schema = makeupSchema(a);
    const m = this.model(`makeup:${mode}:${a.id}:${a.rubric.map((r) => r.id).join('|')}`, () =>
      getGenerativeModel(this.ai, {
        mode,
        onDeviceParams: {
          createOptions: {
            ...DEVICE_CREATE_OPTIONS,
            initialPrompts: [{ role: 'system', content: [{ type: 'text', value: MAKEUP_SYSTEM }] }],
          },
          promptOptions: { responseConstraint: schema },
        },
        inCloudParams: {
          model: this.cfg.cloudFeedbackModel,
          systemInstruction: MAKEUP_SYSTEM,
          generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.6 },
        },
      }),
    );
    const t0 = performance.now();
    const res = await m.generateContent(makeupPrompt(a, g, notes));
    return {
      ...normalizeMakeup(extractJson(res.response.text()), a),
      ranOn: ranOnOf(res.response.inferenceSource),
      ms: performance.now() - t0,
    };
  }
}
