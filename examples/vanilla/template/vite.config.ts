import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/template/' : './',
  server: {
    strictPort: true,
  },
}))
