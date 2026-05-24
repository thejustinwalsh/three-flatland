import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: { conditions: ['source'] },
  define: {
    'import.meta.env.VITE_FLATLAND_DEVTOOLS': JSON.stringify('true'),
  },
  base: command === 'serve' ? '/react/slug-text/' : './',
  server: {
    strictPort: true,
  },
}))
