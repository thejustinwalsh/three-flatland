import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'

export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['three', 'react', '@react-three/fiber', 'koota'],
  onSuccess: async () => {
    mkdirSync('dist/sprites', { recursive: true })
    copyFileSync('src/sprites/atlas.schema.json', 'dist/sprites/atlas.schema.json')
  },
})
