import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  plugins: [react()],
  base: command === 'serve' ? '/react/animation/' : './',
  server: {
    strictPort: true,
  },
}))
