import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/vanilla/basic-sprite/' : './',
  server: {
    strictPort: true,
  },
}))
