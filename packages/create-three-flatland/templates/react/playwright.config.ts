import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end config. `webServer` starts `npm run dev` on a fixed port and tears
 * it down when the run finishes, so `npm run test:e2e` is the whole command —
 * there is no separate "start the server first" step to forget.
 *
 * One-time setup: `npm run test:e2e:install` downloads the Chromium build
 * Playwright drives.
 */

const PORT = 5183
const HOST = '127.0.0.1'
const IS_CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://${HOST}:${PORT}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--strictPort` so a squatter on the port fails loudly instead of Vite
    // quietly picking another one and the tests hitting a stale app.
    command: `npm run dev -- --port ${PORT} --strictPort --host ${HOST}`,
    url: `http://${HOST}:${PORT}/`,
    reuseExistingServer: !IS_CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
