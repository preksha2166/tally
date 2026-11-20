import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config';
import {
  appCheckDebugToken,
  firebaseConfig,
  isFirebaseConfigured,
  MOCK_AI,
  recaptchaProvider,
  recaptchaSiteKey,
} from './config';
import type { RuntimeConfig } from './ai/engine';

export interface FirebaseServices {
  app: FirebaseApp;
  ai: AI;
  auth: Auth;
  db: Firestore;
  rc: RemoteConfig;
  appCheck: boolean;
}

let services: FirebaseServices | null = null;

/** Safe to call more than once (React StrictMode runs effects twice in dev). */
export function initFirebase(): FirebaseServices | null {
  if (MOCK_AI || !isFirebaseConfigured) return null;
  if (services) return services;
  services = createServices();
  return services;
}

function createServices(): FirebaseServices {
  const app = initializeApp(firebaseConfig);

  // Firebase AI Logic enforces App Check. On localhost we use a registered debug token.
  if (import.meta.env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      appCheckDebugToken || true;
  }
  let appCheck = false;
  if (recaptchaSiteKey || import.meta.env.DEV) {
    const key = recaptchaSiteKey || 'debug-only';
    initializeAppCheck(app, {
      provider: recaptchaProvider === 'enterprise' ? new ReCaptchaEnterpriseProvider(key) : new ReCaptchaV3Provider(key),
      isTokenAutoRefreshEnabled: true,
    });
    appCheck = true;
  }

  return {
    app,
    ai: getAI(app, { backend: new GoogleAIBackend() }),
    auth: getAuth(app),
    db: initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
    rc: getRemoteConfig(app),
    appCheck,
  };
}

export const DEFAULT_RUNTIME: RuntimeConfig = {
  cloudGradeModel: 'gemini-3.5-flash-lite',
  cloudFeedbackModel: 'gemini-3.5-flash-lite',
  cloudInsightsModel: 'gemini-3.8-flash',
  maxDeviceChars: 6000,
};

/** Remote Config lets us switch cloud models or limits without shipping a new build. */
export async function loadRuntimeConfig(rc: RemoteConfig | null): Promise<RuntimeConfig & { source: string }> {
  if (!rc) return { ...DEFAULT_RUNTIME, source: 'built-in defaults' };
  rc.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 60_000 : 3_600_000;
  rc.defaultConfig = {
    cloud_grade_model: DEFAULT_RUNTIME.cloudGradeModel,
    cloud_feedback_model: DEFAULT_RUNTIME.cloudFeedbackModel,
    cloud_insights_model: DEFAULT_RUNTIME.cloudInsightsModel,
    max_device_chars: DEFAULT_RUNTIME.maxDeviceChars,
  };
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or not set up yet: cached or default values still apply.
  }
  const str = (k: string, d: string) => getValue(rc, k).asString() || d;
  const num = Number(getValue(rc, 'max_device_chars').asNumber()) || DEFAULT_RUNTIME.maxDeviceChars;
  return {
    cloudGradeModel: str('cloud_grade_model', DEFAULT_RUNTIME.cloudGradeModel),
    cloudFeedbackModel: str('cloud_feedback_model', DEFAULT_RUNTIME.cloudFeedbackModel),
    cloudInsightsModel: str('cloud_insights_model', DEFAULT_RUNTIME.cloudInsightsModel),
    maxDeviceChars: num,
    source: getValue(rc, 'cloud_grade_model').getSource() === 'remote' ? 'Remote Config' : 'Remote Config defaults',
  };
}
