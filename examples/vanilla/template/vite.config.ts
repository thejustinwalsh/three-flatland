import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/template/' : './',
  server: {
    strictPort: true,
  },
}))
