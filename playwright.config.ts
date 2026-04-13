import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright end-to-end smoke-test config.
 *
 * Test files live in `e2e/`. The config auto-starts the examples dev
 * server (`pnpm --filter=examples dev`) on port 5174 and tears it down when
 * the run finishes — unless one is already running, in which case it's
 * reused (fast iteration loop when the dev server is already up).
 *
 * Scripts:
 *   pnpm test:smoke          Run the whole suite headless.
 *   pnpm test:smoke:ui       Interactive UI mode (great for debugging).
 *   pnpm test:smoke:headed   Run headful (watch the browser).
 *   pnpm test:smoke:install  One-time Chromium download.
 */

const PORT = 5174
const BASE_URL = `http://localhost:${PORT}`
// Vite's MPA root returns 404 — use a real example URL so Playwright's
// webServer health check gets a 200 when deciding whether to reuse an
// already-running dev server vs. spawning a fresh one.
const HEALTHCHECK_URL = `${BASE_URL}/three/basic-sprite/`
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  // Sequential by default — the vite dev server's on-demand compilation
  // can trip parallel workers on a cold cache. Bump `workers` locally once
  // you've warmed the server up.
  fullyParallel: false,
  workers: IS_CI ? 1 : 2,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  reporter: IS_CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: IS_CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: IS_CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Start only the examples MPA server (skip the docs site — it adds
    // startup time and isn't needed for smoke tests).
    command: 'pnpm --filter=examples dev',
    url: HEALTHCHECK_URL,
    // The vite dev server reports "ready" quickly but optimizes deps on
    // first page load, which can take 10-20s — the first test navigation
    // absorbs that. 60s is generous.
    timeout: 60_000,
    reuseExistingServer: !IS_CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
