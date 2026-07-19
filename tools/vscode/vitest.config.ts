import { mergeConfig, defineConfig } from 'vitest/config'
import { baseTestConfig } from '../../vitest.base'

export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      // e2e/specs/**/*.spec.ts are Playwright specs (run via `pnpm test:e2e`,
      // not vitest) — vitest's default include would otherwise sweep them in
      // and fail on the `@playwright/test` import. Scope explicitly to the
      // two trees that actually hold vitest unit tests.
      include: ['extension/**/*.test.ts', 'webview/**/*.test.ts'],
    },
  })
)
