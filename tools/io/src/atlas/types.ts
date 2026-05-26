// Wire format stored under meta.animations[name]. frameSet lists unique
// frame names; frames is a playback sequence of integer indices into
// frameSet (repeated indices encode hold counts). This is the schema's
// `Animation` shape — fps/loop/pingPong are optional on the wire (consumers
// supply defaults), required on the in-memory `AnimationInput` model below.
export type { Animation as WireAnimation } from './atlas.types.gen'

// API shape used by builders + in-memory tool models. Frame names are
// post-duplication (holds = repeated names). Converters in build.ts
// translate to/from WireAnimation at the JSON boundary.
export type AnimationInput = {
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

export type RectInput = {
  id: string
  x: number
  y: number
  w: number
  h: number
  name?: string
}

export type AsepriteFrameTag = {
  name: string
  from: number
  to: number
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'
  color?: string
  repeat?: string
  data?: string
}

// AtlasJson is generated from packages/schemas/src/atlas/schema.json — see
// scripts/gen-schema-types.ts. Hand-edits here will be overwritten.
export type { AtlasJson } from './atlas.types.gen'

// Informational record of the sources a merged atlas was built from.
// Lives under meta because the existing schema's meta is
// additionalProperties: true.
export type AtlasMergeMeta = {
  version: '1'
  sources: Array<{
    uri: string
    alias: string
    frames: number
    animations: number
  }>
}
