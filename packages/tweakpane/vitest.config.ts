import { defineConfig } from 'vitest/config'

/**
 * Tweakpane tests touch the DOM (Tweakpane creates real elements via
 * `document.createElement`) and the React hook tests render components via
 * `@testing-library/react`. Both require a browser-like environment, so this
 * project runs in `happy-dom` rather than the default `node` environment used
 * by the root config for the rest of the workspace.
 */
export default defineConfig({
  test: {
    name: 'tweakpane',
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
