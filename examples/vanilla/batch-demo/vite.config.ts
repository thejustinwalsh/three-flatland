import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/batch-demo/' : './',
  server: {
    strictPort: true,
  },
}))
