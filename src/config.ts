/**
 * Build-time configuration read from Vite env files (.env.local, .env.mock).
 *
 * Read each variable by its full name (`import.meta.env.VITE_X`) so Vite inlines only that value.
 * Using the whole `import.meta.env` object would copy every VITE_ variable into the bundle,
 * including the App Check debug token. vite.config.ts fails the build if that ever happens.
 */

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const recaptchaProvider: 'v3' | 'enterprise' =
  import.meta.env.VITE_RECAPTCHA_PROVIDER === 'enterprise' ? 'enterprise' : 'v3';
export const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) || '';

/** Localhost only. Anyone who has this token passes App Check, so production builds never contain it. */
export const appCheckDebugToken: string = import.meta.env.DEV
  ? (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || ''
  : '';

/** Dev-only fake AI (npm run dev:mock). Always off in production builds. */
export const MOCK_AI = import.meta.env.DEV && import.meta.env.VITE_MOCK_AI === '1';

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);
