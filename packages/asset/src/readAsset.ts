import { readGLB } from './glb'
import { AssetError } from './errors'

// ---------------------------------------------------------------------------
// glTF component-type → typed-array constructor map
// ---------------------------------------------------------------------------

const COMPONENT_CTORS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const

type ComponentType = keyof typeof COMPONENT_CTORS

// ---------------------------------------------------------------------------
// glTF accessor type → component count
// ---------------------------------------------------------------------------

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Zero-copy reader over a parsed GLB asset.
 *
 * All typed-array views returned by `accessor` and `bufferView` share the
 * same `ArrayBuffer` that was passed to `readAsset` — no data is copied.
 */
export interface FlatlandAsset {
  /** The raw parsed glTF JSON document. */
  json: any
  /**
   * Return a typed-array view over accessor `index`.
   *
   * The view's element type matches the accessor's `componentType` and its
   * length equals `count × componentsOf(type)`. Throws `AssetError('BAD_ACCESS')`
   * for an out-of-range index or an unrecognised `componentType`/`type`.
   */
  accessor(index: number): ArrayBufferView
  /**
   * Return a `Uint8Array` view over bufferView `index`.
   *
   * Throws `AssetError('BAD_ACCESS')` for an out-of-range index.
   */
  bufferView(index: number): Uint8Array
  /**
   * Return the root extension object named `name`, or `undefined` if absent.
   */
  ext<T = unknown>(name: string): T | undefined
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse a GLB buffer and return a zero-copy `FlatlandAsset` reader.
 *
 * Throws `AssetError('BAD_GLB', …)` for structural GLB violations (delegated
 * to `readGLB`). Throws `AssetError('BAD_ACCESS', …)` for out-of-range
 * accessor/bufferView indices or unrecognised glTF component types.
 */
export function readAsset(buf: ArrayBuffer): FlatlandAsset {
  const { json, binByteOffset } = readGLB(buf)

  function accessor(index: number): ArrayBufferView {
    const accessors: any[] | undefined = json.accessors
    if (!accessors || index < 0 || index >= accessors.length) {
      throw new AssetError('BAD_ACCESS', `accessor index ${index} out of range`)
    }

    const acc = accessors[index]

    const Ctor = COMPONENT_CTORS[acc.componentType as ComponentType]
    if (!Ctor) {
      throw new AssetError(
        'BAD_ACCESS',
        `accessor ${index}: unknown componentType ${acc.componentType}`,
      )
    }

    const components = TYPE_COMPONENTS[acc.type as string]
    if (components === undefined) {
      throw new AssetError(
        'BAD_ACCESS',
        `accessor ${index}: unknown type '${acc.type}'`,
      )
    }

    const bufferViews: any[] | undefined = json.bufferViews
    const bv = bufferViews?.[acc.bufferView]
    if (!bv) {
      throw new AssetError(
        'BAD_ACCESS',
        `accessor ${index}: bufferView index ${acc.bufferView} out of range`,
      )
    }

    const absOffset =
      binByteOffset + (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0)
    const length = acc.count * components

    return new Ctor(buf, absOffset, length)
  }

  function bufferView(index: number): Uint8Array {
    const bufferViews: any[] | undefined = json.bufferViews
    if (!bufferViews || index < 0 || index >= bufferViews.length) {
      throw new AssetError('BAD_ACCESS', `bufferView index ${index} out of range`)
    }

    const bv = bufferViews[index]
    const absOffset = binByteOffset + (bv.byteOffset ?? 0)

    return new Uint8Array(buf, absOffset, bv.byteLength)
  }

  function ext<T = unknown>(name: string): T | undefined {
    return json.extensions?.[name] as T | undefined
  }

  return { json, accessor, bufferView, ext }
}
