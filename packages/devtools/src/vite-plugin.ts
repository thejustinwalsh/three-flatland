/**
 * Vite plugin that serves the standalone devtools dashboard alongside the
 * user's app. Mounts a dev-only middleware at a configurable path (default
 * `/.devtools`).
 *
 * The dashboard source lives inside this package
 * (`packages/devtools/src/dashboard/`), not inside the consumer's project.
 * The plugin:
 *   1. Whitelists the dashboard directory via `server.fs.allow` so Vite
 *      is willing to read its files across the workspace boundary.
 *   2. Serves `index.html` at the mount path, rewritten so the entry
 *      script loads via `/@fs/<abs>` — Vite then transforms it with full
 *      HMR.
 *   3. Aliases the vendored Preact files so `import from 'preact'`
 *      resolves locally — no runtime dep on Preact leaks into the
 *      consumer's `node_modules`.
 *
 * Access the dashboard at the Vite dev server's origin directly, e.g.
 * `http://localhost:5174/.devtools`. If the host project sits behind a
 * microfrontend proxy, point the browser at the Vite port — the
 * dashboard's transitive requests (`/@fs/`, `/@vite/client`, pre-bundled
 * `node_modules/.vite/`) are not namespaced and expect to land on the
 * same origin that served the HTML.
 *
 * Dev-only; the plugin is inert in production builds.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

export interface ThreeFlatlandDevtoolsOptions {
  /** URL path the dashboard is served under. Default: `/.devtools`. */
  path?: string
}

const DEFAULT_PATH = '/.devtools'

function resolveDashboardRoot(): string {
  // Three possible layouts for this file at runtime:
  //   1. `packages/devtools/src/vite-plugin.ts`      (source condition)
  //   2. `packages/devtools/dist/vite-plugin.js`     (workspace, Node import condition)
  //   3. `node_modules/@three-flatland/devtools/dist/vite-plugin.js` (published)
  //
  // For (2) — the dev workflow where Node loads the built plugin but we
  // want HMR over the unbuilt sources — prefer the sibling `../src/dashboard/`
  // if it exists. Otherwise resolve `./dashboard` relative to this file.
  const here = dirname(fileURLToPath(import.meta.url))
  const siblingSrc = resolve(here, '../src/dashboard')
  if (existsSync(siblingSrc)) return siblingSrc
  return resolve(here, 'dashboard')
}

export function threeFlatlandDevtools(
  options: ThreeFlatlandDevtoolsOptions = {},
): Plugin {
  const mountPath = options.path ?? DEFAULT_PATH
  const dashboardRoot = resolveDashboardRoot()
  const vendorRoot = resolve(dashboardRoot, 'vendor')

  return {
    name: 'three-flatland-devtools',
    apply: 'serve',

    config() {
      return {
        resolve: {
          // Order matters — Vite/rollup-plugin-alias matches left-to-right
          // by string prefix, so the broad `preact` entry must come last
          // or it swallows `preact/jsx-*` and `preact/hooks`.
          alias: [
            {
              find: 'preact/jsx-runtime',
              replacement: resolve(vendorRoot, 'jsx-runtime.js'),
            },
            {
              // esbuild dev mode emits `import { jsxDEV } from 'preact/jsx-dev-runtime'`;
              // the same shim exports `jsxDEV`.
              find: 'preact/jsx-dev-runtime',
              replacement: resolve(vendorRoot, 'jsx-runtime.js'),
            },
            {
              find: 'preact/hooks',
              replacement: resolve(vendorRoot, 'hooks.module.js'),
            },
            {
              find: /^preact$/,
              replacement: resolve(vendorRoot, 'preact.module.js'),
            },
          ],
        },
      }
    },

    configResolved(config) {
      // Append, don't replace. Returning an array from `config` would
      // overwrite Vite's default allow-list (project + workspace root),
      // locking the host app out of its own files.
      if (!config.server.fs.allow.includes(dashboardRoot)) {
        config.server.fs.allow.push(dashboardRoot)
      }
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === undefined) return next()
        const url = req.url.split('?')[0] ?? ''
        if (url !== mountPath && url !== `${mountPath}/`) return next()

        try {
          const indexPath = resolve(dashboardRoot, 'index.html')
          let html = await readFile(indexPath, 'utf-8')
          const entryAbs = resolve(dashboardRoot, 'index.tsx')
          html = html.replace('./index.tsx', `/@fs${entryAbs}`)
          html = await server.transformIndexHtml(req.url, html, req.originalUrl)
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (err) {
          next(err)
        }
      })

      const logger = server.config.logger
      const port = server.config.server.port ?? 5173
      logger.info(
        `\n  \u001b[32m\u279c\u001b[0m  three-flatland devtools: \u001b[36mhttp://localhost:${port}${mountPath}\u001b[0m\n`,
      )
    },
  }
}

export default threeFlatlandDevtools
