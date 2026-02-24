import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/pass-effects/' : './',
  server: {
    strictPort: true,
  },
}))
