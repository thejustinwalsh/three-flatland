import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/pass-effects/' : './',
  server: {
    strictPort: true,
  },
}))
