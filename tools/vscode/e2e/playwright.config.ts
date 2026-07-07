import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

/**
 * VS Code extension end-to-end harness.
 *
 * Unlike the root `playwright.config.ts` (browser tests against the built
 * docs site), this launches a real VS Code (Electron) build via
 * `@playwright/test`'s `_electron` + `@vscode/test-electron`'s
 * `downloadAndUnzipVSCode` — see `e2e/README.md` for why this is
 * hand-rolled rather than built on `vscode-test-playwright` (a concrete
 * incompatibility with our pinned Playwright version, not a style call),
 * the fixture-workspace-per-test rule, and the webview iframe-drilling
 * pattern used by `e2e/fixtures.ts`.
 *
 * `globalSetup` builds the extension (host + webview bundles) and bundles
 * the host-bridge's extension-host runner once before any test launches
 * VS Code — `--extensionDevelopmentPath` reads straight off `dist/`, so
 * tests must never race a stale build.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  // VS Code windows are heavyweight and the fixture workspace is mutated
  // per test; keep this serial rather than fighting for CPU/port budget.
  fullyParallel: false,
  workers: 1,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  reporter: IS_CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: path.join(__dirname, 'test-results'),
  use: {
    trace: IS_CI ? 'retain-on-failure' : 'on-first-retry',
  },
})
