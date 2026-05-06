import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'import.meta.env.VITE_FLATLAND_DEVTOOLS': JSON.stringify('true'),
  },
  plugins: [react()],
  base: command === 'serve' ? '/react/skia/' : './',
  server: {
    strictPort: true,
  },
}))
