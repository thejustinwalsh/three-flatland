/**
 * Minimal GLB loader helpers for reading a baked `.slug.glb`.
 *
 * Internal to the slug loader — parses the GLB container and returns zero-copy
 * typed-array views over glTF accessors. Not a general asset abstraction; just
 * the bytes-to-accessors plumbing `SlugFontLoader` and `unpackBaked` need.
 */

const GLB_MAGIC = 0x46546c67 // "glTF" LE
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a // "JSON" LE
const CHUNK_BIN = 0x004e4942 // "BIN\0" LE

interface GltfAccessor {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: string
}
interface GltfBufferView {
  byteOffset?: number
  byteLength: number
}
interface GltfJson {
  accessors?: GltfAccessor[]
  bufferViews?: GltfBufferView[]
  extensions?: Record<string, unknown>
}

const COMPONENT_CTORS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const
type ComponentType = keyof typeof COMPONENT_CTORS

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

const decoder = new TextDecoder()

/** Zero-copy view over a baked `.slug.glb`'s accessors + root extensions. */
export interface GlbView {
  /** Typed-array view over accessor `index` (element type per componentType). */
  accessor(index: number): ArrayBufferView
  /** Root extension object named `name`, or `undefined`. */
  ext<T = unknown>(name: string): T | undefined
}

/** Parse a `.slug.glb` buffer into a zero-copy reader. Throws on malformed GLB. */
export function readGlb(buf: ArrayBuffer): GlbView {
  if (buf.byteLength < 12) throw new Error(`readGlb: GLB too short (${buf.byteLength} bytes)`)
  const view = new DataView(buf)
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('readGlb: invalid GLB magic')
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error('readGlb: unsupported GLB version')
  const fileEnd = Math.min(view.getUint32(8, true), buf.byteLength)

  // First chunk must be JSON.
  if (20 > fileEnd) throw new Error('readGlb: missing JSON chunk')
  const jsonLen = view.getUint32(12, true)
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('readGlb: first chunk is not JSON')
  if (20 + jsonLen > fileEnd) throw new Error('readGlb: JSON chunk exceeds file')
  let json: GltfJson
  try {
    json = JSON.parse(decoder.decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson
  } catch (err) {
    throw new Error(`readGlb: bad JSON chunk: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Second chunk (optional) is BIN; otherwise binByteOffset stays past the JSON.
  let binByteOffset = 20 + jsonLen
  if (binByteOffset + 8 <= fileEnd && view.getUint32(binByteOffset + 4, true) === CHUNK_BIN) {
    binByteOffset += 8
  }

  function accessor(index: number): ArrayBufferView {
    const accessors = json.accessors
    if (!accessors || index < 0 || index >= accessors.length)
      throw new Error(`readGlb: accessor ${index} out of range`)
    const acc = accessors[index] as GltfAccessor
    const Ctor = COMPONENT_CTORS[acc.componentType as ComponentType]
    if (!Ctor) throw new Error(`readGlb: accessor ${index} unknown componentType ${acc.componentType}`)
    const components = TYPE_COMPONENTS[acc.type]
    if (components === undefined) throw new Error(`readGlb: accessor ${index} unknown type '${acc.type}'`)
    const bv = acc.bufferView !== undefined ? json.bufferViews?.[acc.bufferView] : undefined
    if (!bv) throw new Error(`readGlb: accessor ${index} bad bufferView`)
    const absOffset = binByteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    return new Ctor(buf, absOffset, acc.count * components)
  }

  function ext<T = unknown>(name: string): T | undefined {
    return json.extensions?.[name] as T | undefined
  }

  return { accessor, ext }
}
