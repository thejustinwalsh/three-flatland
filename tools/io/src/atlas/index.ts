export type { AnimationInput, AsepriteFrameTag, AtlasJson, AtlasMergeMeta, RectInput, WireAnimation } from './types'

export {
  animationInputToWire,
  atlasToRects,
  baseFramePassthrough,
  buildAtlasJson,
  importAsepriteFrameTags,
  readAnimationsFromJson,
  uniqueKey,
  wireAnimationToInput,
} from './build'

export {
  animationInputToFrameTag,
  buildAsepriteJson,
  buildTexturePackerJson,
  detectAtlasFormat,
  type AtlasFormat,
} from './formats'

export { packRects, type PackInput, type PackResult, type Placement } from './maxrects'

export {
  aliasFromUri,
  computeMerge,
  namespaceSource,
  type MergeInput,
  type MergeResult,
  type MergeSource,
  type NameConflict,
} from './merge'
