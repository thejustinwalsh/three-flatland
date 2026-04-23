import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// One Vite build per tool webview. As we add tools (normal-baker, image-encoder,
// zzfx-studio), each grows its own vite.*.config.ts and `build:webview` composes
// them. For now we only have the atlas editor.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/tools/atlas/webview'),
  // Emit relative asset URLs. The webview is served from a per-workspace
  // vscode-webview:// origin we can't know at build time; relative URLs
  // resolve correctly against both the index.html URL (for <link>/<script>)
  // and against the CSS file's own URL (for url() refs to the font).
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/webview/atlas'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    assetsDir: 'assets',
  },
})
