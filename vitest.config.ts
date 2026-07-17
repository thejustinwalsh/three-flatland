import { defineConfig } from 'vitest/config'

const coreProject = {
  resolve: {
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    name: 'core',
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
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'packages/starlight-theme/**/*.test.ts',
      'scripts/**/*.test.ts',
      'tools/*/src/**/*.test.ts',
      'tools/vscode/webview/**/*.test.ts',
      'tools/vscode/extension/**/*.test.ts',
    ],
    exclude: ['packages/skia/**', 'packages/devtools/**', '**/node_modules/**'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8' as const,
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
}

export default defineConfig({
  // Workspace packages expose TypeScript entrypoints behind the `source`
  // condition. Tests exercise the monorepo as source, so they must not depend
  // on stale or absent dist output from a previous Turbo build.
  resolve: {
    conditions: ['source'],
  },
  // Vitest executes Node projects through Vite's SSR loader, whose condition
  // set is separate from client resolution in Vite 7.
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    projects: [coreProject, 'packages/devtools/vitest.config.ts', 'docs/vitest.config.ts'],
  },
})
