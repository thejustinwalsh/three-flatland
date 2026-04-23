import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/CanvasStage.tsx',
    'src/ThreeLayer.tsx',
    'src/RectOverlay.tsx',
    'src/SpritePreview.tsx',
    'src/Viewport.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['react', 'three', '@react-three/fiber', '@react-three/fiber/webgpu', 'three-flatland'],
})
