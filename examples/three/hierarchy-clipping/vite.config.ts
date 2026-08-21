import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  // Production smoke tests assert the example's live FPS and draw-call stats.
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  base: command === 'serve' ? '/three/hierarchy-clipping/' : './',
  server: { strictPort: true },
}))
