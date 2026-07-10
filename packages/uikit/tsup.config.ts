import { defineConfig } from 'tsup'

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
})
