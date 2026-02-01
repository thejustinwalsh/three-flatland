import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/animation/' : './',
  server: {
    strictPort: true,
  },
}))
