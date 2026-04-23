import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Replaces the leading `./` (or `/`) on every asset URL Vite emits with
 * a well-known token the extension host substitutes at runtime with the
 * actual `vscode-webview://` base URI returned by `webview.asWebviewUri()`.
 *
 * Why: the webview iframe loads from `vscode-webview://HASH/` (root) but
 * resources must be fetched via the full vscode-cdn URI. The cdn URI is
 * per-workspace and only knowable at runtime in the extension host — Vite
 * can't hard-code it at build time. Tokenizing gives us a clean one-shot
 * runtime replace instead of a regex rewrite pass.
 */
function tokenizeAssetBase(token = '%FL_BASE%'): Plugin {
  return {
    name: 'fl-tokenize-asset-base',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/((?:src|href))="(?:\.\/|\/)(?=[^/"])/g, (_m, attr) => `${attr}="${token}`)
      },
    },
  }
}

// One Vite build per tool webview. As we add tools (normal-baker, image-
// encoder, zzfx-studio), each grows its own vite.<tool>.config.ts.
export default defineConfig({
  plugins: [react(), tokenizeAssetBase()],
  root: resolve(__dirname, 'src/tools/atlas/webview'),
  // Emit relative asset URLs. CSS-internal url() refs stay relative so they
  // resolve correctly against the stylesheet's own cdn URI. HTML asset URLs
  // get tokenized by the plugin above for runtime substitution.
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/webview/atlas'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    assetsDir: 'assets',
  },
})
