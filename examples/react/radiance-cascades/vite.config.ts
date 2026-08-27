import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: {
    conditions: ['source'],
    dedupe: ['react', 'react-dom', 'three'],
  },
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  plugins: [react()],
  base: command === 'serve' ? '/react/radiance-cascades/' : './',
  server: {
    strictPort: true,
  },
}))
