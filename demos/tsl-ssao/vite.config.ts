import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      'three/webgpu': 'three/src/Three.WebGPU.js',
      'three/tsl': 'three/src/Three.TSL.js',
    },
  },
})
