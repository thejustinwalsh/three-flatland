import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/react/batch-demo/',
  plugins: [react()],
  server: {
    strictPort: true,
  },
})
