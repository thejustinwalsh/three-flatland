/**
 * Standalone bundle build for the dashboard. Emits a self-contained
 * static site (`index.html` + hashed JS chunk + vendored Preact) into
 * `packages/devtools/bundle/`.
 *
 * Why a separate config (and `bundle/` rather than `dist/`):
 * tsup owns `dist/` for the package's published exports. The dashboard
 * is a static app, not an export — its production form needs its own
 * output dir.
 *
 * Why a separate task (`build:bundle`) instead of folding into `build`:
 * tsup runs the same way regardless of whether the dashboard is being
 * shipped to a docs site. The bundle is only useful when something
 * (the docs site, an external host) wants to ship the dashboard
 * static. Keeping it as an opt-in task means the published package is
 * still cheap to rebuild.
 */
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const dashboardRoot = resolve(here, 'src/dashboard')
const vendorRoot = resolve(dashboardRoot, 'vendor')

export default defineConfig({
  root: dashboardRoot,
  // Relative `base` so the bundle works at any mount point — the docs
  // site copies this output into `docs/public/devtools/` and serves it
  // at `/three-flatland/devtools/`. With `base: './'`, the emitted
  // `<script src>` and asset URLs are relative and don't bake in any
  // origin assumption.
  base: './',
  // Mirror the workspace example builds so `three-flatland/debug-protocol`
  // resolves to the package's `source` exports condition (TS files)
  // rather than its compiled `dist`. Keeps the dashboard buildable
  // even when the package's tsup output is stale.
  resolve: {
    conditions: ['source'],
    alias: [
      { find: 'preact/jsx-runtime', replacement: resolve(vendorRoot, 'jsx-runtime.js') },
      { find: 'preact/jsx-dev-runtime', replacement: resolve(vendorRoot, 'jsx-runtime.js') },
      { find: 'preact/hooks', replacement: resolve(vendorRoot, 'hooks.module.js') },
      { find: /^preact$/, replacement: resolve(vendorRoot, 'preact.module.js') },
    ],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    outDir: resolve(here, 'bundle'),
    emptyOutDir: true,
    sourcemap: true,
    // Single-page MPA build — `index.html` is the only entry, Vite
    // walks its `<script>` tag from there.
    rollupOptions: {
      input: resolve(dashboardRoot, 'index.html'),
    },
  },
})
