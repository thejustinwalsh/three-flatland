import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vscode from '@tomjs/vite-plugin-vscode'
import { resolve } from 'node:path'

// Plugin convention: extension code lives in extension/, webview code in
// webview/. The plugin runs tsdown for extension/index.ts and Vite for the
// webview; it also injects a virtual:vscode module that exposes
// getWebviewHtml({ webview, context, ... }) for use in the extension host.
// Dev mode gives us real webview HMR.
export default defineConfig({
  plugins: [
    react(),
    vscode({
      extension: {
        entry: 'extension/index.ts',
      },
    }),
  ],
  root: resolve(__dirname, 'webview'),
  build: {
    rollupOptions: {
      input: {
        // Each tool that gets its own webview adds an entry here. When we
        // add zzfx-studio / normal-baker / image-encoder, they append to
        // this input map and the host requests them via
        // getWebviewHtml({ inputName: '<tool>' }).
        atlas: resolve(__dirname, 'webview/atlas/index.html'),
      },
    },
  },
})
