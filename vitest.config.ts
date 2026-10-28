import { defineConfig } from 'vitest/config'

// Unit tests: the shared code, the scripts' own (the synthetic SIUS PDFs read back through pdf.js) and the functions'
// (the signed contract, read back the same way). The rules tests have their own config in tests/rules and need the
// emulators (npm run test:rules).
export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'scripts/**/*.test.ts', 'functions/src/**/*.test.ts'],
  },
})
