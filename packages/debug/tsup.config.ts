import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    gui: 'src/gui/index.ts',
    'gui-react': 'src/gui/react.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['lil-gui', 'zustand', 'zustand/vanilla', 'zustand/react/shallow', 'react'],
})
