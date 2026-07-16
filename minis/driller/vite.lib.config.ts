import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactCompiler from 'babel-plugin-react-compiler'
import { resolve } from 'node:path'

/**
 * Library build for `@three-flatland/mini-driller`. Consumed by the
 * docs site as a hero element.
 *
 * Vite's `import.meta.env.DEV` is `false` in build mode automatically
 * — no `define` block needed. Combined with rollup's tree-shaking
 * (more aggressive than esbuild's), `if (import.meta.env.DEV) { ... }`
 * branches AND the symbols they reference (`ensureDebugRenderState`,
 * `tickDebugRenderFrame`, `recordCellRender`) get eliminated entirely.
 *
 * Types are emitted separately by `tsc --emitDeclarationOnly` (see
 * the `build:types` script). Avoiding `vite-plugin-dts` keeps the
 * dependency surface small.
 *
 * Verification:
 *   pnpm build && rg '__drillerRender|recordCellRender|ensureDebugRenderState' dist
 *   → must print nothing.
 */
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [reactCompiler],
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'three',
        '@react-three/fiber',
        '@react-three/fiber/webgpu',
        'koota',
        'koota/react',
        'three-flatland',
        'three-flatland/react',
        '@three-flatland/nodes',
        '@three-flatland/presets',
        '@three-flatland/presets/react',
        '@three-flatland/devtools/react',
      ],
    },
  },
})
