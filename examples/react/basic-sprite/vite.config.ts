import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify('true'),
  },
  plugins: [react()],
  base: command === 'serve' ? '/react/basic-sprite/' : './',
  server: {
    strictPort: true,
  },
}))
