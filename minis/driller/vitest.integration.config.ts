import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Integration test runner. Each test spawns vitexec, which boots a
 * headless Chromium against the dev build and streams probe output
 * back. Tests are slow (60–180s each) — DO NOT run on every commit.
 *
 * Invoked via `pnpm test:integration`. The unit-test runner
 * (`pnpm test`) explicitly excludes `tests/integration/` so the
 * inner loop stays fast.
 */
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  server: {
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Each integration test orchestrates a real browser session.
    // Default 5s timeout would fail every test before it warms up.
    // The runner has its own hard timeout per probe (timeoutSec +
    // 60s margin) — vitest's testTimeout is the outer bound and
    // must be larger than the largest probe's hard timeout. Probe
    // budgets so far: shake-contract=150s, timing=150s, offscreen=180s,
    // → max hard timeout 240s, so 300s gives runner-failure messages
    // a chance to surface BEFORE vitest's generic "test timed out".
    testTimeout: 300_000,
    hookTimeout: 60_000,
    // No concurrency: each probe contends for the same vitexec
    // browser slot. Run sequentially.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
