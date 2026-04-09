import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readdirSync, existsSync, createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Discover all example index.html files under three/ and react/ */
function discoverExamples(): Record<string, string> {
  const input: Record<string, string> = {}
  for (const type of ['three', 'react']) {
    const typeDir = path.resolve(__dirname, type)
    if (!existsSync(typeDir)) continue
    for (const name of readdirSync(typeDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue
      const indexHtml = path.resolve(typeDir, name.name, 'index.html')
      if (existsSync(indexHtml)) {
        input[`${type}/${name.name}`] = indexHtml
      }
    }
  }
  return input
}

const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

/**
 * Vite plugin that handles MPA routing and per-example public directories.
 *
 * - Routes /{type}/{name}/ to the correct index.html in dev mode
 * - Serves static files from each example's public/ directory, since
 *   Vite's publicDir only supports a single directory
 */
function mpaRoutingPlugin(): Plugin {
  return {
    name: 'mpa-routing',
    configureServer(server) {
      // Serve per-example public/ directories
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const match = url.match(/^\/(three|react)\/([^/]+)\/(.+)$/)
        if (match) {
          const [, type, name, filePath] = match
          const publicFile = path.resolve(__dirname, type, name, 'public', filePath)
          if (existsSync(publicFile) && statSync(publicFile).isFile()) {
            const ext = path.extname(publicFile).toLowerCase()
            const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
            res.setHeader('Content-Type', mime)
            createReadStream(publicFile).pipe(res)
            return
          }
        }
        next()
      })

      // Route /{type}/{name}/ to index.html
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? ''
        const match = url.match(/^\/(three|react)\/([^/]+)\/?$/)
        if (match) {
          const [, type, name] = match
          const indexHtml = path.resolve(__dirname, type, name, 'index.html')
          if (existsSync(indexHtml)) {
            req.url = `/${type}/${name}/index.html`
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  appType: 'mpa',
  resolve: {
    conditions: ['source'],
    // Force a single instance of these libs across the workspace.
    // Without this, pnpm's per-package symlinks create duplicate module
    // instances → React "Invalid hook call" errors.
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'three',
      '@react-three/fiber',
    ],
  },
  plugins: [react(), mpaRoutingPlugin()],
  // Pre-bundle all deps in a single pass at startup by pointing entries
  // at every example HTML. This avoids on-demand re-optimization (which
  // changes hashes mid-session and causes 504/404 errors).
  optimizeDeps: {
    entries: ['three/*/index.html', 'react/*/index.html'],
  },
  build: {
    rollupOptions: {
      input: discoverExamples(),
    },
  },
  server: {
    strictPort: true,
  },
})
