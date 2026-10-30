import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests: the shared code, the scripts' own (the synthetic SIUS PDFs read back through pdf.js) and the functions'
// (the signed contract, read back the same way; the AI providers' requests and answers). The rules tests have their
// own config in tests/rules and need the emulators (npm run test:rules).
export default defineConfig({
  // The functions import the shared code as @shared, as their build does (functions/tsconfig.json).
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) } },
  test: {
    include: ['shared/src/**/*.test.ts', 'scripts/**/*.test.ts', 'functions/src/**/*.test.ts'],
    // A scan of a made-up card photo takes seconds, more in CI, where the typecheck runs beside the tests
    // (scripts/ci-checks.sh): 5 seconds, the default, failed main once.
    testTimeout: 30_000,
  },
})
