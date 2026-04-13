import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/three/basic-sprite/' : './',
  server: {
    strictPort: true,
  },
}))
