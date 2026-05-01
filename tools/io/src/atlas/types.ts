// Wire format stored under meta.animations[name]. frameSet lists unique
// frame names; frames is a playback sequence of integer indices into
// frameSet (repeated indices encode hold counts).
export type WireAnimation = {
  frameSet: string[]
  frames: number[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}

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

// Strict superset of TexturePacker JSON-Hash + Aseprite shapes — see
// packages/three-flatland/src/sprites/atlas.schema.json.
export type AtlasJson = {
  $schema?: string
  meta: {
    app: string
    version: string
    sources: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
    size: { w: number; h: number }
    scale: string
    animations?: Record<string, WireAnimation>
    frameTags?: readonly AsepriteFrameTag[]
    layers?: readonly unknown[]
    slices?: readonly unknown[]
    merge?: AtlasMergeMeta
    [k: string]: unknown
  }
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      pivot?: { x: number; y: number }
      duration?: number
    }
  >
}

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
