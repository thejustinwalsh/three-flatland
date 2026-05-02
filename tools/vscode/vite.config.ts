import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'
import { dirname, resolve } from 'node:path'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'

// Multi-tool webview bundle. Each tool lives at webview/<tool>/index.html
// and gets its own rollup input entry auto-discovered. Adding a new tool is
// just dropping a new `webview/<tool>/` folder with index.html + main.tsx —
// no config change required.
const toolsDir = resolve(__dirname, 'webview')
const inputs = Object.fromEntries(
  readdirSync(toolsDir)
    .filter((name) => {
      const p = resolve(toolsDir, name)
      try {
        return statSync(p).isDirectory() && statSync(resolve(p, 'index.html')).isFile()
      } catch {
        return false
      }
    })
    .map((tool) => [tool, resolve(toolsDir, tool, 'index.html')])
)

/**
 * Replaces the leading `./` (or `/`) on every asset URL Vite emits with a
 * token the extension host substitutes at runtime with the real
 * vscode-webview:// cdn URI for that panel. CSS `url()` refs inside the
 * emitted stylesheet stay relative (`./codicon.ttf`) and resolve correctly
 * against the stylesheet's own cdn URI.
 */
function tokenizeAssetBase(token = '%FL_BASE%'): Plugin {
  return {
    name: 'fl-tokenize-asset-base',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Match any asset URL prefix: `../`, `./`, or `/`, in any sequence.
        // Vite emits `../assets/...` from a tool subdir, `./assets/...` from
        // a root HTML, `/assets/...` with base: '/'. All collapse to the
        // same shared asset dir under the webview root.
        return html.replace(
          /((?:src|href))="(?:\.\.?\/)+(?=[^/"])/g,
          (_m, attr) => `${attr}="${token}`
        )
      },
    },
  }
}

/**
 * Three's KTX2Loader fetches its transcoder via `setTranscoderPath(dir) +
 * 'basis_transcoder.js'` literally — it appends the unhashed filename to
 * a directory URL. Vite's normal `?url` import would emit a hashed asset
 * name (basis_transcoder-<hash>.js) which the loader can't find. This
 * plugin emits both files unhashed at `dist/webview/assets/basis_transcoder.js`
 * and `.wasm` so KTX2Loader's internal fetch resolves under the webview's
 * `vscode-webview://` origin.
 *
 * Replaced by Phase 2.1.2's owned KTX2Loader fork which decouples from
 * three's URL-loader machinery.
 */
function copyBasisTranscoder(): Plugin {
  return {
    name: 'fl-copy-basis-transcoder',
    apply: 'build',
    generateBundle() {
      // Resolve via Node's module resolution so it works with pnpm's virtual
      // store layout (the file lives under node_modules/.pnpm/three@.../node_modules/three/...
      // not directly at node_modules/three/...).
      const require = createRequire(import.meta.url)
      const jsPath = require.resolve('three/examples/jsm/libs/basis/basis_transcoder.js')
      const basisDir = dirname(jsPath)
      this.emitFile({
        type: 'asset',
        fileName: 'assets/basis_transcoder.js',
        source: readFileSync(jsPath),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'assets/basis_transcoder.wasm',
        source: readFileSync(resolve(basisDir, 'basis_transcoder.wasm')),
      })
    },
  }
}

// In watch mode (`vite build --watch`) we deliberately keep the previous
// build's output around: emptying dist/webview/ on every rebuild creates
// a window where the panel can't load chunks if the user reloads while
// Rollup is still writing. For one-shot prod builds (`vite build`) we
// still want a clean output dir so stale hashed assets don't accumulate.
const isWatchMode = process.argv.includes('--watch') || process.argv.includes('-w')

export default defineConfig({
  plugins: [
    stylex.vite({ useCSSLayers: true }),
    react(),
    tokenizeAssetBase(),
    copyBasisTranscoder(),
  ],
  root: resolve(__dirname, 'webview'),
  base: './',
  // jsquash codec workers (avif_enc_mt.js etc.) are Emscripten IIFE bundles
  // that Vite tries to re-bundle as Workers. IIFE is incompatible with
  // code-splitting; switching worker output to ES modules avoids the error.
  worker: { format: 'es' },
  build: {
    outDir: resolve(__dirname, 'dist/webview'),
    emptyOutDir: !isWatchMode,
    sourcemap: true,
    target: 'esnext',
    assetsDir: 'assets',
    rollupOptions: {
      input: inputs,
    },
  },
})
