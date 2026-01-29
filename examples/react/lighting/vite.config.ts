import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/react/lighting',
  plugins: [react()],
  server: {
    strictPort: true,
  },
})
