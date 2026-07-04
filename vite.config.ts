// ADR: see spec/mvp-vertical-nubank.adr.md
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // GitHub Pages serve o app no subcaminho /<repo>/; em dev continua na raiz.
  base: mode === 'production' ? '/conta-de-gastos-v2/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['spike/**', 'legado/**', 'node_modules/**'],
  },
}))
