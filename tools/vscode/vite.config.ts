import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// One Vite build per tool webview. As we add tools (normal-baker, image-encoder,
// zzfx-studio), each grows its own vite.*.config.ts and `build:webview` composes
// them. For now we only have the atlas editor.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/tools/atlas/webview'),
  build: {
    outDir: resolve(__dirname, 'dist/webview/atlas'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    assetsDir: 'assets',
  },
})
