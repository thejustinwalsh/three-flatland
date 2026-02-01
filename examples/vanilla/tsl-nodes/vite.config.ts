import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/tsl-nodes/' : './',
  server: {
    strictPort: true,
  },
}))
