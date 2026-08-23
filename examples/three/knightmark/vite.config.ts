import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  resolve: { conditions: ['source'] },
  define: {
    'process.env.FL_DEVTOOLS': JSON.stringify(process.env.FL_DEVTOOLS ?? 'true'),
    'process.env.FL_PROFILE': JSON.stringify(process.env.FL_PROFILE ?? 'false'),
  },
  base: command === 'serve' ? '/three/knightmark/' : './',
  server: {
    strictPort: true,
  },
}))
