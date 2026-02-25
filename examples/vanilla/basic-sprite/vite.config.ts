import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/basic-sprite/' : './',
  server: {
    strictPort: true,
  },
}))
