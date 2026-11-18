import { defineConfig, devices } from '@playwright/test';
import { entornoSupabase } from './e2e/entorno';

const PUERTO = 4173;
const URL_BASE = `http://127.0.0.1:${PUERTO}`;
const entorno = entornoSupabase();

/**
 * E2E del caso piloto (BRIEF §6.3, issue #9). Corre contra Supabase local y contra la
 * aplicación compilada (`vite build` + `vite preview`), solo en Chromium.
 * Las claves se leen del entorno o de `supabase status`; nunca se versionan.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Un solo flujo largo: sin paralelismo para no competir por la misma base local.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: URL_BASE,
    locale: 'es-EC',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PUERTO} --strictPort`,
    url: URL_BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_SUPABASE_URL: entorno.url,
      VITE_SUPABASE_ANON_KEY: entorno.claveAnonima,
    },
  },
});
