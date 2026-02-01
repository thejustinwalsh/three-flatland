import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/tilemap/' : './',
  server: {
    strictPort: true,
  },
}))
