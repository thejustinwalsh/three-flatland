import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: { conditions: ['source'] },
  base: command === 'serve' ? '/react/slug-text/' : './',
  server: {
    strictPort: true,
  },
}))
