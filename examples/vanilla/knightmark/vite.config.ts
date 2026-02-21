import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/knightmark/' : './',
  server: {
    strictPort: true,
  },
}))
