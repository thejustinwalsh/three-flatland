import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/animation/' : './',
  server: {
    strictPort: true,
  },
}))
