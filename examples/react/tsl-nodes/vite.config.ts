import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/react/tsl-nodes/' : './',
  server: {
    strictPort: true,
  },
}))
