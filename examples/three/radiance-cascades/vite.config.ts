import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  base: command === 'serve' ? '/three/radiance-cascades/' : './',
  server: {
    strictPort: true,
  },
}))
