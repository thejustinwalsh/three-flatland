import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 'source' resolves workspace packages to their src/ entries so the
    // example always runs against the live fork, never a stale dist build.
    conditions: ['source'],
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
})
