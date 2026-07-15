import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // The glob covers every subpath entry in package.json's exports map,
    // including ./text (src/text/index.ts) and ./svg — new subpaths need
    // an exports entry but no change here. Fixtures are excluded so test
    // helpers never ship.
    entry: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/**/*.fixture.ts',
      '!src/**/*.tsx',
      '!src/**/*.d.ts',
      '!src/cli.ts',
    ],
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
    // Self-contained bin: bundle the bake deps (opentype.js, @gltf-transform/core)
    // so it runs under node ESM without resolution issues.
    external: ['three', 'react', '@react-three/fiber'],
    noExternal: ['@gltf-transform/core', 'opentype.js'],
  },
])
