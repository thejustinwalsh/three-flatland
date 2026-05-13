import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite config for integration probe runs.
 *
 * The default `vite.config.ts` uses `strictPort: true` so the user's
 * daily `pnpm dev:app` notices port collisions instead of silently
 * drifting to a different port. That's the right behavior for dev.
 *
 * For integration tests we want the OPPOSITE: pick any free port,
 * never collide. The runner (`tests/integration/_runner.ts`) probes a
 * fresh port via `net.createServer().listen(0)` and passes it through
 * `process.env.DRILLER_INTEGRATION_PORT`. With strictPort=false, vite
 * will *also* fall back if the picked port is somehow stolen between
 * runner-pick and vite-bind (rare, but possible). The runner retries
 * on a non-zero exit, so the suite is self-healing.
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
    port: Number(process.env.DRILLER_INTEGRATION_PORT) || 0,
    strictPort: false,
  },
})
