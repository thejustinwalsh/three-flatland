import { bench, group } from '@pmndrs/labs'
import { Light2D } from '../../../packages/three-flatland/src/lights/Light2D.ts'
import { LightStore } from '../../../packages/three-flatland/src/lights/LightStore.ts'

if (
  process.env['NODE_ENV'] !== 'production' ||
  process.env['FL_PROFILE'] === 'true' ||
  process.env['FL_DEVTOOLS'] === 'true'
) {
  throw new Error('LightStore Labs benchmarks require production mode without profiling or devtools')
}

interface Context {
  lights: Light2D[]
  store: LightStore
}

function createContext(count: number): Context {
  const lights = Array.from(
    { length: count },
    (_, index) =>
      new Light2D({
        type: index % 4 === 0 ? 'spot' : index % 4 === 1 ? 'point' : index % 4 === 2 ? 'directional' : 'ambient',
        position: [index % 64, Math.floor(index / 64)],
        direction: [1, -1],
        color: 0x80c0ff,
        intensity: 0.5 + (index % 8) / 8,
        distance: 32 + (index % 16),
        decay: 2,
        angle: Math.PI / 3,
        penumbra: 0.25,
        castsShadow: (index & 1) === 0,
        category: `group-${index & 3}`,
      })
  )
  const store = new LightStore()
  store.sync(lights)
  return { lights, store }
}

function assertProjection(context: Context): void {
  const data = Reflect.get(context.store, '_lightsData') as Float32Array
  const lineSize = context.store.maxLights * 4
  const last = context.lights.length - 1
  if (data[last * 4] !== context.lights[last]!.position.x) {
    throw new Error('LightStore fixture did not project the last light position')
  }
  if (data[lineSize + last * 4 + 1] !== context.lights[last]!.intensity) {
    throw new Error('LightStore fixture did not project the last light intensity')
  }
}

function register(count: number, tags = ''): void {
  bench(`lights ${count.toLocaleString()} ${tags}`.trim(), function* () {
    const context = createContext(count)
    try {
      yield { bench: () => context.store.sync(context.lights) }
      assertProjection(context)
    } finally {
      context.store.dispose()
    }
  }).gc('inner')
}

group('LightStore production sync @light-store-sync', () => {
  register(1, '@light-store-sync-smoke')
  register(64)
  register(1_000, '@scale')
})
