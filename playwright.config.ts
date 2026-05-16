import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright end-to-end smoke-test config.
 *
 * Test files live in `e2e/`. The config auto-starts the docs preview
 * server (`pnpm --filter=docs preview`) on port 4321 and tears it down
 * when the run finishes — unless one is already running, in which case
 * it's reused.
 *
 * The preview server serves the built `docs/dist/` site, including each
 * example's static artifact copied in via the `copy-examples` vite plugin.
 * Testing the prod path (instead of the Vite examples dev server) catches
 * build-pipeline regressions where an example's `dist/` never makes it
 * into the docs output — the failure mode that bit slug-text in #69.
 *
 * The `test:smoke` scripts (see `package.json`) route through the
 * `//#test:e2e` root task in `turbo.json`, which declares `docs#build`
 * as a dependency. Turbo resolves that dep first (cache-skips when
 * inputs haven't changed) before invoking `playwright test`, so
 * `docs/dist/` is always present and fresh without an explicit chain.
 * CI's `smoke` job inherits the upstream build job's turbo cache via
 * the restore-key fallback, so the dep resolves instantly there too.
 *
 * Scripts:
 *   pnpm test:smoke          Build (turbo) + run the suite headless.
 *   pnpm test:smoke:ui       Build (turbo) + interactive UI mode.
 *   pnpm test:smoke:headed   Build (turbo) + headful run.
 *   pnpm test:smoke:install  One-time Chromium download.
 *   pnpm test:e2e            Direct Playwright invocation (skips
 *                            the turbo build dep — use sparingly).
 */

const PORT = 4321
// Astro's docs config sets `base: '/three-flatland/'`; the preview server
// serves the built site at that base path. baseURL ends with `/` so
// that `page.goto('examples/foo/')` and `request.get('examples/foo/')`
// resolve under it via URL composition. A leading `/` in a path is
// absolute-to-host and would strip the base segment, returning 404s.
const BASE_URL = `http://localhost:${PORT}/three-flatland/`
// Astro returns 404 at the base root with `base` set — use a real example
// URL so Playwright's webServer health check gets a 200 when deciding
// whether to reuse an already-running preview server vs. spawning fresh.
const HEALTHCHECK_URL = `${BASE_URL}examples/three/basic-sprite/`
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
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
    // `astro preview` serves the prebuilt `docs/dist/` without rebuilding.
    // Fails fast if `pnpm build` hasn't been run.
    command: 'pnpm --filter=docs preview --port 4321 --host 127.0.0.1',
    url: HEALTHCHECK_URL,
    timeout: 30_000,
    reuseExistingServer: !IS_CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
