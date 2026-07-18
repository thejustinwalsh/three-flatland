import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    server: {
      deps: {
        // gltf-validator ships Dart-compiled JS that must not be transformed
        // by Vite's SSR pipeline — it relies on CJS globals and inspects
        // navigator.userAgent at evaluation time in a way that breaks under
        // Vite's module transform. Mark it external so Node loads it natively.
        external: ['gltf-validator'],
      },
    },
    // Packages are per-project now (`nx test <pkg>`, each with its own vitest.config
    // extending vitest.base.ts). This root config covers ONLY the non-package
    // surface — scripts + the tools/ packages that don't yet have their own nx
    // test target — and runs as the root `//#test` nx target so `nx run-many -t
    // test` still includes it. Do not re-add packages/* here.
    include: [
      'scripts/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      'tools/vscode/webview/**/*.test.ts',
      'tools/vscode/extension/**/*.test.ts',
    ],
    // audio-play has its OWN nx test target — exclude it here so it isn't double-run.
    exclude: ['tools/audio-play/**', '**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/index.ts'],
    },
    typecheck: {
      include: ['packages/*/src/**/*.test-d.ts', 'packages/*/src/**/*.test-d.tsx'],
      exclude: ['packages/skia/**', 'packages/tweakpane/**', '**/node_modules/**'],
      tsconfig: './packages/three-flatland/tsconfig.json',
    },
  },
})
