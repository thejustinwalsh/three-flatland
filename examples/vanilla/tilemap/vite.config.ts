import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/vanilla/tilemap/' : './',
  server: {
    strictPort: true,
  },
}))
