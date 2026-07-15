import type { Frame } from './atlas.types.gen'

// Wire format stored under meta.animations[name]. frameSet lists unique
// frame names; frames is a playback sequence of integer indices into
// frameSet (repeated indices encode hold counts). This is the schema's
// `Animation` shape — fps/loop/pingPong are optional on the wire (consumers
// supply defaults), required on the in-memory `AnimationInput` model below.
export type { Animation as WireAnimation } from './atlas.types.gen'

// API shape used by builders + in-memory tool models. Frame names are
// post-duplication (holds = repeated names). Converters in build.ts
// translate to/from WireAnimation at the JSON boundary.
//
// The Aseprite-only fields below (`direction`/`color`/`repeat`/`data`) are a
// passthrough for a loaded `meta.frameTags` entry's metadata that our own
// `animations` model has no equivalent for — carried through unedited so a
// round-trip save back to Aseprite's format doesn't silently drop them. They
// are never read or written by the native (`fl-sprite-atlas`) format.
export type AnimationInput = {
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
} & Partial<Pick<AsepriteFrameTag, 'direction' | 'color' | 'repeat' | 'data'>>

// Composes the generated `Frame` wire type (everything but the packed
// `frame` rect itself, which RectInput already flattens into x/y/w/h) as
// optional passthrough fields. This is what lets a loaded TexturePacker or
// Aseprite frame's rotation/trim/pivot/polygon-mesh/duration survive a
// load → (unrelated edit) → save round trip instead of being silently
// discarded — see `atlasToRects`/`buildAtlasJson` in build.ts, which carry
// these through instead of hardcoding `rotated:false, trimmed:false, …`.
// A freshly-packed rect (all these fields absent) behaves exactly as
// before this type was extended.
export type RectInput = {
  id: string
  x: number
  y: number
  w: number
  h: number
  name?: string
} & Partial<Omit<Frame, 'frame'>>

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
