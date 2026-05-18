import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'import.meta.env.VITE_FLATLAND_DEVTOOLS': JSON.stringify('true'),
  },
  base: command === 'serve' ? '/three/batch-demo/' : './',
  server: {
    strictPort: true,
  },
}))
