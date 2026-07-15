import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: {
    conditions: ['source'],
    // Dedupe so the example serves standalone (like the bento) without duplicate
    // React/three instances tripping "Invalid hook call".
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  // react-compiler auto-memoizes every component — for a scene that scales to
  // 98k live cards this changes reconciliation cost enormously, so it must be
  // wired identically to the upstream comparison app (see
  // packages/uikit/example/vite.config.ts) for the A/B measurement to be fair.
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })],
  base: command === 'serve' ? '/react/uikit-perf/' : './',
  server: {
    strictPort: true,
  },
}))
