// ADR: see spec/spike-geracao-xlsx.adr.md
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
