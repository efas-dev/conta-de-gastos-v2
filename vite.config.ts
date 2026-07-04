// ADR: see spec/mvp-vertical-nubank.adr.md
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Worktree partilha node_modules do projeto principal (sem node_modules próprio).
// resolve.alias mapeia os pacotes de teste para os caminhos absolutos na main.
const mainModules = '/Users/es/Documents/conta_de_gastos/node_modules'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@testing-library\/(.+)$/, replacement: `${mainModules}/@testing-library/$1` },
      { find: /^@glideapps\/(.+)$/, replacement: `${mainModules}/@glideapps/$1` },
      { find: /^zustand(.*)$/, replacement: `${mainModules}/zustand$1` },
      { find: /^immer(.*)$/, replacement: `${mainModules}/immer$1` },
      { find: /^fflate(.*)$/, replacement: `${mainModules}/fflate$1` },
      { find: /^react-dom(.*)$/, replacement: `${mainModules}/react-dom$1` },
      { find: /^react(.*)$/, replacement: `${mainModules}/react$1` },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['spike/**', 'legado/**', 'node_modules/**'],
    deps: {
      moduleDirectories: ['node_modules', `${mainModules}`],
    },
  },
})
