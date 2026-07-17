import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactCompiler from 'babel-plugin-react-compiler'

export default defineConfig({
  resolve: {
    conditions: ['source'],
    // Vitexec creates its own Vite server from this package directory.
    // Force renderer singletons back to the workspace copies so source-
    // condition packages cannot pull a second React or Three instance.
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  optimizeDeps: {
    // Vitexec disables HMR and starts with an empty optimizer cache. Include
    // renderer singletons up front so workspace source imports do not execute
    // against a second, late-discovered React graph during the first load.
    include: ['react', 'react-dom', 'react/jsx-runtime', '@react-three/fiber/webgpu'],
  },
  plugins: [
    react({
      babel: {
        plugins: [reactCompiler],
      },
    }),
  ],
  server: {
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests are slow (each spins up a headless browser
    // via vitexec for 60–180s of live observation). They have their
    // own runner — see `pnpm test:integration` and
    // `vitest.integration.config.ts`.
    exclude: ['node_modules/**', 'dist/**', 'tests/integration/**'],
  },
})
