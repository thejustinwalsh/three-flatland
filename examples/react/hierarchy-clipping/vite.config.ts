import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  // Production smoke tests assert the example's live FPS and draw-call stats.
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  plugins: [react()],
  base: command === 'serve' ? '/react/hierarchy-clipping/' : './',
  server: { strictPort: true },
}))
