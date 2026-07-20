import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Unit tests only — the Playwright specs under e2e/ are run by playwright.config.ts.
  test: { include: ['src/**/*.test.ts'] },
})
