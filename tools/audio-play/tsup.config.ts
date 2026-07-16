import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/audioContextGuard.ts',
    'src/client.ts',
    'src/commandHandler.ts',
    'src/contextLifecycle.ts',
    'src/player.ts',
    'src/protocol.ts',
    'src/sidecar.ts',
    'src/toneEngineLoader.ts',
    'src/wadLoader.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: false,
})
