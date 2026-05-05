import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  deps: {
    neverBundle: [
      'react',
      'three',
      '@react-three/fiber',
      'koota',
      'three-flatland',
      '@three-flatland/nodes',
    ],
  },
})
