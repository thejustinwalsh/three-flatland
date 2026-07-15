import { signal } from '@preact/signals-core'
import { ExperimentalFeature, type Node, type Yoga, loadYoga } from 'yoga-layout/load'
import { LAYOUT_GRID } from '../quantize.js'

// A power-of-two grid: 1/128 is exactly representable in float, so Yoga's snapped
// output and our JS-side derivations land on identical grid points (see quantize.ts).
export const PointScaleFactor = LAYOUT_GRID

export function createDefaultConfig(Config: Yoga['Config']) {
  const config = Config.create()
  config.setUseWebDefaults(true)
  config.setPointScaleFactor(PointScaleFactor)
  config.setExperimentalFeatureEnabled(ExperimentalFeature.WebFlexBasis, true)
  return config
}

const create = signal<(() => Node) | undefined>(undefined)
loadYoga()
  .then(({ Node, Config }) => {
    const config = createDefaultConfig(Config)
    create.value = () => Node.create(config)
  })
  .catch(console.error)

export const createYogaNode = () => create.value?.()
