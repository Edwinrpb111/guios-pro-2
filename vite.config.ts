/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/guios-core/**/*.ts'],
      exclude: ['src/guios-core/**/*.test.ts', 'src/guios-core/fixtures/**'],
      // Definición de terminado (BRIEF §15.1): cobertura de guios-core >= 95 %.
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
