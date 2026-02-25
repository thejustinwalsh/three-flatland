import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/tsl-nodes/' : './',
  server: {
    strictPort: true,
  },
}))
