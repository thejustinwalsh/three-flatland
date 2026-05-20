import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.tsx', '!src/**/*.d.ts', '!src/cli.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: false,
    external: ['three', 'react', '@react-three/fiber'],
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    bundle: true,
    // Bundle all CLI deps (opentype.js, @gltf-transform/core, @three-flatland/asset)
    // so the CLI is self-contained and works under node ESM without extension issues.
    // three/react/r3f are peer-only and never imported by the bake pipeline.
    external: ['three', 'react', '@react-three/fiber'],
    noExternal: ['@three-flatland/asset', '@gltf-transform/core', 'opentype.js'],
  },
])
