import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['src/components/**/*.test.{ts,tsx}'],
  },
})
