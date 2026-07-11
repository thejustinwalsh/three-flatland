import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    // 'source' resolves workspace packages to their src/ entries so the example
    // always runs against the live fork, never a stale dist build.
    conditions: ['source'],
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  // react-compiler auto-memoizes every component, so a state change in one card
  // (e.g. Reel's play/pause) never re-renders siblings — which would otherwise
  // reset their imperative slider values via uikit's per-render resetProperties.
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })],
})
