import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  // react-compiler auto-memoizes every component, so a state change in one card
  // (e.g. Reel's play/pause) never re-renders siblings — which would otherwise reset
  // their imperative slider values via uikit's per-render resetProperties.
  plugins: [react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })],
  base: command === 'serve' ? '/react/uikit-bento/' : './',
  server: {
    strictPort: true,
  },
}))
