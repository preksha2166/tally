# Setting up TAlly with your own Firebase project

About 30 minutes, all free (Spark plan). Do the steps in order.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**. Name it e.g. `tally-grading`. Google Analytics is not needed.
2. In the project, open **Build → AI Logic** (also shown as **AI Services → AI Logic**), click **Get started**, and choose the **Gemini Developer API** (no billing needed).

## 2. Register the web app
1. **Project settings (gear) → General → Your apps → Web (`</>`)**. Nickname `tally-web`. Tick **Also set up Firebase Hosting**.
2. Copy the `firebaseConfig` values into `.env.local` (`VITE_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._MESSAGING_SENDER_ID`, `..._APP_ID`).

## 3. Turn on Auth, Firestore and Remote Config
1. Open **Authentication** in the left menu (click **Get started** if you see it) → **Sign-in method** → **Anonymous**. Switch **Enable** on and click **Save**. The row should then say **Enabled**. (Optional: also enable Google.)
2. **Build → Firestore Database → Create database**, production mode, any nearby location.
3. Remote Config is filled from `remoteconfig.template.json` when you deploy (step 6).

## 4. App Check (required by Firebase AI Logic)
TAlly uses **Fraud Defense** (formerly reCAPTCHA Enterprise). It needs only a key ID, no secret key.

1. Open https://console.cloud.google.com/security/recaptcha?project=<project-id>. If it asks you to enable the API, click **Enable**.
2. Click **Create key** and fill in:
   - Display name: `tally-web`
   - Platform: **Web**
   - Domains: `<project-id>.web.app` and `<project-id>.firebaseapp.com`. Do **not** add `localhost`. The debug token below covers it.
   - Leave **Use checkbox challenge** and **Will you deploy this key in a WAF?** turned off.
3. Copy the **key ID**, a long code that starts with `6L`. In `.env.local`, set `VITE_RECAPTCHA_SITE_KEY` to it and keep `VITE_RECAPTCHA_PROVIDER=enterprise`.
4. In the Firebase console, open **App Check → Apps → your web app → Fraud Defense (formerly reCAPTCHA Enterprise)**. Paste the key ID into **reCAPTCHA Enterprise site key** and click **Save**. Leave the classic **reCAPTCHA** section below it empty.
5. Give `localhost` a debug token so it can call the AI. Run `[guid]::NewGuid().ToString()` in PowerShell (any random UUID works) and put the result in `.env.local` as `VITE_APPCHECK_DEBUG_TOKEN`. On the same App Check screen, click **⋮ → Manage debug tokens → Add debug token**, paste the same value and click **Save**. Keep it private: anyone who has it can pass App Check for your project.

Prefer classic reCAPTCHA v3? It still works, though Firebase marks it deprecated. Set `VITE_RECAPTCHA_PROVIDER=v3`, use the v3 site key, and paste its secret key into the **reCAPTCHA** section instead.

## 5. Gemini Nano in Chrome (for on-device grading)
1. Desktop Chrome 139 or newer. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → Relaunch.
2. Open TAlly → **Setup → Download Gemini Nano (one time)**. Chrome downloads the model in the background. You can watch it at `chrome://on-device-internals`.
3. Hardware Chrome needs: more than 4 GB GPU VRAM, **or** 16 GB RAM with 4+ CPU cores, plus 22 GB free disk.

## 6. Run and deploy
```powershell
npm install
npm run dev
```
Open http://localhost:5173. Deploy (hosting, Firestore rules and Remote Config):
```powershell
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use --add
npm run deploy
```

UI only, with no Firebase at all: `npm run dev:mock` (fake AI answers, dev only).
