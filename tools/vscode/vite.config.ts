import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vscode from '@tomjs/vite-plugin-vscode'

// Plugin convention (from the react example):
//   index.html at package root, webview src in ./src, extension in ./extension.
// No `root` override, no multi-input. The plugin handles the rest — getWebviewHtml
// returns a dev-iframe shell in dev mode and an inlined prod HTML in build mode.
export default defineConfig({
  plugins: [
    react(),
    vscode({
      extension: {
        entry: 'extension/index.ts',
      },
    }),
  ],
  // Root pnpm dev already serves docs + examples on 5173; pin tool webviews to
  // 5200 and fail loudly if taken. `host: 'localhost'` — not 127.0.0.1 — so the
  // webview sandbox treats the iframe origin as the plugin's hardcoded literal.
  server: {
    port: 5200,
    strictPort: true,
    host: 'localhost',
  },
})
