import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/three/batch-demo/' : './',
  server: {
    strictPort: true,
  },
}))
