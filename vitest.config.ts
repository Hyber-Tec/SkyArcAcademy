import { defineConfig } from 'vitest/config'

// Unit tests: the shared code, and the scripts' own (the synthetic SIUS PDFs read back through pdf.js). The rules
// tests have their own config in tests/rules and need the emulators (npm run test:rules).
export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
