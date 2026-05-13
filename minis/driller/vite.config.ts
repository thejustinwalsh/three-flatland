import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
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
