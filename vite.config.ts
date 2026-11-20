import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Fails the build if the App Check debug token ends up in the output. Anyone who has the token
 * passes App Check for the whole project, so it must only ever exist on the developer's machine.
 */
function noDebugTokenInBundle(): Plugin {
  let token = '';
  return {
    name: 'tally:no-debug-token-in-bundle',
    apply: 'build',
    configResolved(config) {
      token = String(config.env.VITE_APPCHECK_DEBUG_TOKEN ?? '');
    },
    generateBundle(_options, bundle) {
      if (!token) return;
      for (const [file, out] of Object.entries(bundle)) {
        const text = out.type === 'chunk' ? out.code : typeof out.source === 'string' ? out.source : new TextDecoder().decode(out.source);
        if (text.includes(token)) {
          this.error(`The App Check debug token is in ${file}. Read it only behind import.meta.env.DEV (see src/config.ts).`);
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), noDebugTokenInBundle()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
