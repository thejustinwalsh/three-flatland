import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

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
const packageModule = (name: string): string =>
  fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url))

export default defineConfig({
  cacheDir: 'node_modules/.vite-integration',
  resolve: {
    conditions: ['source'],
    // Vitexec owns a separate Vite graph. Pin renderer singletons to this
    // package's workspace links so linked source packages cannot load their
    // own React or Three copies and crash hooks before the probe attaches.
    // Exact matches keep package export maps active for subpaths such as
    // `three/addons/*` and `@react-three/fiber/webgpu`.
    alias: [
      { find: /^react$/, replacement: packageModule('react') },
      { find: /^react-dom$/, replacement: packageModule('react-dom') },
      { find: /^three$/, replacement: packageModule('three') },
      { find: /^@react-three\/fiber$/, replacement: packageModule('@react-three/fiber') },
    ],
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  // Runtime probes validate browser behavior, not compiler transforms. Keeping
  // the React Compiler out of this isolated graph also avoids its memo-cache
  // runtime being bound to a different React instance before dedupe settles.
  plugins: [react()],
  server: {
    port: Number(process.env.DRILLER_INTEGRATION_PORT) || INTEGRATION_FALLBACK_PORT,
    strictPort: false,
  },
})
