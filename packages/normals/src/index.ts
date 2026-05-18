// Browser-safe default entry. Ships the pure bake algorithm, the
// descriptor types, and the runtime `NormalMapLoader`.
//
// Node-only helpers (file I/O, CLI) live under `@three-flatland/normals/node`
// so bundlers targeting the browser don't pull in `node:fs` or pngjs.

export {
  bakeNormalMap,
  bakeNormalMapFromPixels,
  bakedNormalURL,
  type BakeOptions,
} from './bake.js'
export {
  NormalMapLoader,
  type NormalMapResult,
} from './NormalMapLoader.js'
export {
  resolveNormalMap,
  type ResolveNormalMapOptions,
} from './resolveNormalMap.js'
export {
  directionToAngle,
  resolveRegion,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  DEFAULT_BUMP,
  DEFAULT_ELEVATION,
  type NormalDirection,
  type NormalBump,
  type NormalRegion,
  type NormalSourceDescriptor,
  type ResolvedNormalRegion,
} from './descriptor.js'
