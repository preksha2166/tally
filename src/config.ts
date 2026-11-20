/** Build-time configuration read from Vite env files (.env.local, .env.mock). */

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const recaptchaProvider: 'v3' | 'enterprise' =
  env.VITE_RECAPTCHA_PROVIDER === 'enterprise' ? 'enterprise' : 'v3';
export const recaptchaSiteKey = (env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || '';
export const appCheckDebugToken = (env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || '';

/** Dev-only fake AI (npm run dev:mock). Always off in production builds. */
export const MOCK_AI = env.DEV && env.VITE_MOCK_AI === '1';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);
