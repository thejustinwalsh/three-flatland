import { defineConfig } from 'tsup'
import { cpSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.test.ts', '!src/**/*.d.ts'],
  format: ['esm', 'cjs'],
  // d.ts is emitted by `tsc -p tsconfig.build.json` instead: rollup-plugin-dts
  // bundles declarations into a hashed chunk (index-XXXX.d.ts) and re-exports them
  // under mangled aliases, so consumers cannot name re-exported zod schema types
  // (TS2742). Per-file tsc emit keeps every declaration at a nameable path.
  dts: false,
  sourcemap: true,
  clean: true,
  bundle: false,
  // Code-splitting emits hashed chunks (dist/index-XXXX.js) that are not
  // exported subpaths. Zod-inferred schema types re-exported by the kits then
  // fail declaration emit with TS2742 ("cannot be named"). Keep 1:1 file output.
  splitting: false,
  external: ['three', 'react', '@react-three/fiber'],
  async onSuccess() {
    // Copy the bundled default-font TTF (provisional D5 — see text/font.ts) next to
    // its compiled module so `new URL('./assets/Inter-Regular.ttf', import.meta.url)`
    // resolves against dist the same way it resolves against src. Mirrors
    // packages/skia/tsup.config.ts's onSuccess asset-copy precedent.
    cpSync(
      resolve(__dirname, 'src/text/assets/Inter-Regular.ttf'),
      resolve(__dirname, 'dist/text/assets/Inter-Regular.ttf')
    )
  },
})
