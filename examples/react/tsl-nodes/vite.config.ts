import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/react/tsl-nodes/',
  plugins: [react()],
  server: {
    strictPort: true,
  },
})
