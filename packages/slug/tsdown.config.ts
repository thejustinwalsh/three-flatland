import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/**/*.test-d.ts',
      '!src/**/*.tsx',
      '!src/**/*.d.ts',
      '!src/cli.ts',
    ],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    unbundle: true,
    fixedExtension: false,
    deps: { neverBundle: ['three', 'react', '@react-three/fiber'] },
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    fixedExtension: false,
    // Self-contained bin: bundle the bake deps (opentype.js, @gltf-transform/core)
    // so it runs under node ESM without resolution issues.
    deps: {
      neverBundle: ['three', 'react', '@react-three/fiber'],
      alwaysBundle: ['@gltf-transform/core', 'opentype.js'],
    },
  },
])
