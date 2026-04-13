import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/three/template/' : './',
  server: {
    strictPort: true,
  },
}))
