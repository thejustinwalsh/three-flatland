import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Vite config for integration probe runs.
 *
 * Port discipline. The integration runner picks a fresh free port
 * per spawn via `net.createServer().listen(0)` and passes it through
 * `process.env.DRILLER_INTEGRATION_PORT`. When that env var is
 * present (the normal path), vite binds it.
 *
 * **Fallback policy.** If the env var is missing — e.g., the user
 * invokes this config directly outside the runner — we DO NOT fall
 * back to vite's default 5173. The default port clashes with the
 * workspace's daily `pnpm dev:app` and any other vite project the
 * user has open; an orphan integration server holding 5173 silently
 * blocks unrelated work. Instead the fallback is in the dynamic /
 * ephemeral range so it never collides with the conventional ports.
 *
 * `strictPort: false` keeps the runner's race-retry path working —
 * if the runner-picked port is somehow stolen between bind and
 * vite-startup, vite picks the next free one and the runner's
 * 3-attempt loop handles the diagnosis.
 */
const INTEGRATION_FALLBACK_PORT = 51730 // 5173 + zero (mnemonic), in IANA dynamic range
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
    port: Number(process.env.DRILLER_INTEGRATION_PORT) || INTEGRATION_FALLBACK_PORT,
    strictPort: false,
  },
})
