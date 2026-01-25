import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/react/animation',
  plugins: [react()],
  server: {
    strictPort: true,
  },
})
