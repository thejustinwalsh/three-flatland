import {
  attribute,
  texture,
  vec2,
  vec4,
  float,
  If,
  Discard,
  select,
  positionLocal,
  positionPrevious,
  normalLocal,
  property,
  vec3,
  subBuild,
  cameraProjectionMatrix,
  modelViewMatrix,
  viewport,
  buffer,
  storage,
  instanceIndex,
  instancedBufferAttribute,
  instancedDynamicBufferAttribute,
  mat4,
  transformNormal,
  varyingProperty,
  morphReference,
  skinning,
  materialReference,
  batch,
  OnObjectUpdate,
} from 'three/tsl'
import {
  type Texture,
  type InstancedMesh,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  DynamicDrawUsage,
  FrontSide,
  NormalBlending,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
} from 'three'
import { EventNode, type NodeBuilder, type StorageInstancedBufferAttribute } from 'three/webgpu'
import type Node from 'three/src/nodes/core/Node.js'
import { uv } from 'three/tsl'
import { EffectMaterial } from './EffectMaterial'
import { readFlip, readPixelPerfectFlag, readRotatedFrameFlag } from './instanceAttributes'
import { synthQuadNodes } from './synthQuadNodes'
import { getAtlasMesh } from '../loaders/atlasMeshRegistry'
import type { GlobalUniforms } from '../GlobalUniforms'
import { installInstanceEventUpdateBeforePatch } from '../pipeline/_instanceEventUpdateBeforePatch'

// Public material/tilemap subpaths can be consumed without importing
// SpriteBatch. Install the idempotent r185 instance-upload timing patch here
// too so custom InstancedMesh + Sprite2DMaterial users get the same behavior.
installInstanceEventUpdateBeforePatch()

// @types/three@0.185.4 does not yet expose these public r185 NodeBuilder
// methods, although Three's own TSL nodes use both. Keep the compatibility
// cast local so the material can follow Three's canonical instance path.
type SpriteNodeBuilder = NodeBuilder & {
  getUniformBufferLimit(): number
  hasGeometryAttribute(name: string): boolean
  needsPreviousData(): boolean
}

const instanceMatrixBuffers = new WeakMap<InstancedBufferAttribute, InstancedInterleavedBuffer>()
const instanceColorBuffers = new WeakMap<InstancedBufferAttribute, InstancedBufferAttribute>()
const previousInstanceMatrices = new WeakMap<
  InstancedMesh,
  { matrix: InstancedBufferAttribute; node: Node<'mat4'>; interleaved: InstancedInterleavedBuffer | null }
>()
const canonicalInstanceColor = varyingProperty('vec3', 'vInstanceColor')

interface InstanceMatrixSource {
  node: Node<'mat4'>
  interleaved: InstancedInterleavedBuffer | null
}

interface InstanceColorSource {
  node: Node<'vec3'>
  interleaved: InstancedBufferAttribute | null
}

/**
 * Build Three's canonical instance-matrix source once so both the transformed
 * vertex and its translation column share one GPU binding. Three r185's public
 * `instancedMesh()` helper applies the matrix but does not return its node;
 * calling it a second time creates a second full matrix buffer.
 */
function createInstanceMatrixNode(builder: SpriteNodeBuilder, matrix: InstancedBufferAttribute): InstanceMatrixSource {
  const count = Math.max(matrix.count, 1)
  if ('isStorageInstancedBufferAttribute' in matrix && matrix.isStorageInstancedBufferAttribute) {
    return {
      node: storage(matrix as StorageInstancedBufferAttribute, 'mat4', count).element(instanceIndex) as Node<'mat4'>,
      interleaved: null,
    }
  }
  if (count * 16 * 4 <= builder.getUniformBufferLimit()) {
    const matrixBuffer = buffer(matrix.array, 'mat4', count) as unknown as {
      element(index: Node<'uint'>): Node<'mat4'>
    }
    return { node: matrixBuffer.element(instanceIndex), interleaved: null }
  }

  let interleaved = instanceMatrixBuffers.get(matrix)
  if (!interleaved) {
    interleaved = new InstancedInterleavedBuffer(matrix.array as Float32Array, 16, 1)
    instanceMatrixBuffers.set(matrix, interleaved)
  }

  const attribute = matrix.usage === DynamicDrawUsage ? instancedDynamicBufferAttribute : instancedBufferAttribute
  return {
    node: mat4(
      attribute(interleaved, 'vec4', 16, 0),
      attribute(interleaved, 'vec4', 16, 4),
      attribute(interleaved, 'vec4', 16, 8),
      attribute(interleaved, 'vec4', 16, 12)
    ) as Node<'mat4'>,
    interleaved,
  }
}

/** Build Three's canonical optional instance-color source without deep imports. */
function createInstanceColorNode(colors: InstancedBufferAttribute): InstanceColorSource {
  if ('isStorageInstancedBufferAttribute' in colors && colors.isStorageInstancedBufferAttribute) {
    return {
      node: storage(colors as StorageInstancedBufferAttribute, 'vec3', Math.max(colors.count, 1)).element(
        instanceIndex
      ) as Node<'vec3'>,
      interleaved: null,
    }
  }

  let interleaved = instanceColorBuffers.get(colors)
  if (!interleaved) {
    interleaved = new InstancedBufferAttribute(colors.array, 3)
    instanceColorBuffers.set(colors, interleaved)
  }
  const attribute = colors.usage === DynamicDrawUsage ? instancedDynamicBufferAttribute : instancedBufferAttribute
  return {
    node: attribute(interleaved, 'vec3', 3, 0) as Node<'vec3'>,
    interleaved,
  }
}

/**
 * Register the same combined callback shape as Three r185 so the local timing
 * patch moves these range/version copies ahead of geometry upload.
 */
function installInstanceBufferSync(
  matrices: InstancedBufferAttribute,
  interleavedMatrix: InstancedInterleavedBuffer | null,
  colors: InstancedBufferAttribute | null,
  interleavedColor: InstancedBufferAttribute | null
): void {
  if (interleavedMatrix === null && interleavedColor === null) return

  new EventNode(EventNode.FRAME as typeof EventNode.OBJECT, () => {
    if (interleavedMatrix !== null) {
      interleavedMatrix.clearUpdateRanges()
      interleavedMatrix.updateRanges.push(...matrices.updateRanges)
      if (matrices.version !== interleavedMatrix.version) interleavedMatrix.version = matrices.version
    }
    if (colors !== null && interleavedColor !== null) {
      interleavedColor.clearUpdateRanges()
      interleavedColor.updateRanges.push(...colors.updateRanges)
      if (colors.version !== interleavedColor.version) interleavedColor.version = colors.version
    }
  }).toStack()
}

/** Apply one shared instance matrix to position, pivot, normal, and motion data. */
function applyInstanceTransform(builder: SpriteNodeBuilder, object: InstancedMesh): void {
  const matrix = object.instanceMatrix
  const matrixSource = createInstanceMatrixNode(builder, matrix)
  const matrixNode = matrixSource.node
  const matrixColumns = matrixNode as Node<'mat4'> & Record<number, Node<'vec4'>>
  const colorSource = object.instanceColor ? createInstanceColorNode(object.instanceColor) : null

  installInstanceBufferSync(matrix, matrixSource.interleaved, object.instanceColor, colorSource?.interleaved ?? null)

  spritePixelPivot.assign(matrixColumns[3]!.xyz)
  positionLocal.assign(matrixNode.mul(positionLocal).xyz)

  if (builder.needsPreviousData()) {
    let previous = previousInstanceMatrices.get(object)
    if (!previous) {
      const previousMatrix = matrix.clone() as InstancedBufferAttribute
      const previousSource = createInstanceMatrixNode(builder, previousMatrix)
      const created = {
        matrix: previousMatrix,
        node: previousSource.node,
        interleaved: previousSource.interleaved,
      }
      previousInstanceMatrices.set(object, created)
      previous = created
    }
    OnObjectUpdate(({ object: renderedObject }) => {
      const renderedMesh = renderedObject as InstancedMesh
      const renderedPrevious = previousInstanceMatrices.get(renderedMesh)
      if (!renderedPrevious) return
      renderedPrevious.matrix.array.set(renderedMesh.instanceMatrix.array)
      renderedPrevious.matrix.needsUpdate = true
      if (renderedPrevious.interleaved) renderedPrevious.interleaved.needsUpdate = true
    })
    positionPrevious.assign(previous.node.mul(positionPrevious).xyz)
  }

  if (builder.hasGeometryAttribute('normal')) {
    normalLocal.assign(transformNormal(normalLocal, matrixNode))
  }

  if (colorSource) canonicalInstanceColor.assign(colorSource.node)
}

// Re-export types that moved to EffectMaterial for backwards compatibility
export type { ColorTransformContext, ColorTransformFn } from './EffectMaterial'
import type { ColorTransformFn } from './EffectMaterial'

export interface Sprite2DMaterialOptions {
  map?: Texture
  transparent?: boolean
  alphaTest?: number
  /**
   * Whether sprites using this material receive lighting. Part of the
   * material identity (batching) key — lit and unlit sprites can't share
   * a batch. Default `false`.
   */
  lit?: boolean
  /**
   * Use premultiplied alpha blending.
   * When true, the shader outputs `vec4(rgb * alpha, alpha)` and uses
   * `CustomBlending` with `OneFactor` / `OneMinusSrcAlphaFactor`.
   * This eliminates `Discard()` calls, improving performance on WebGL
   * by preserving early-z optimization. Depth writes are disabled since
   * transparent pixels produce (0,0,0,0) which blends to nothing.
   */
  premultipliedAlpha?: boolean
  /**
   * Effect buffer tier size in floats.
   * Buffers are allocated in tiers: 0, 4, 8, 16.
   * Default is 8 (2 vec4 buffers), covering most effect combinations.
   * Set to 0 for fully effect-free materials (no effect buffer overhead).
   */
  effectTier?: number
  /** Color transform function for custom effects (e.g., lighting) */
  colorTransform?: ColorTransformFn
  /** Global uniforms for auto-applying tint, time, etc. */
  globalUniforms?: GlobalUniforms
  /** Effect configuration key for material caching/batching */
  effectsKey?: string
}

// Global material ID counter for batching
let nextMaterialId = 0

// Vertex-stage local populated by setupPosition. It is derived from Three's
// canonical instance transform rather than duplicated in a second upload.
const spritePixelPivot = property('vec3', 'spritePixelPivot')

// WeakMap to assign stable numeric IDs to colorTransform functions
const colorTransformIds = new WeakMap<ColorTransformFn, number>()
let nextColorTransformId = 0

function getColorTransformId(fn: ColorTransformFn | undefined): number {
  if (!fn) return -1
  let id = colorTransformIds.get(fn)
  if (id === undefined) {
    id = nextColorTransformId++
    colorTransformIds.set(fn, id)
  }
  return id
}

/**
 * Compute the non-texture fragment of `Sprite2DMaterial`'s shared-cache
 * key (transparent, lit, colorTransform, alphaTest, premultipliedAlpha,
 * effectsKey). `getShared()` prefixes this with the texture id for its
 * flat module-global cache; world-scoped variant resolution
 * (`ecs/batchUtils.ts`'s `getWorldEffectVariant`) keys its per-world
 * store by texture identity already, so it uses this fragment alone.
 * Exported so both call sites build an identical key from one place.
 */
export function sprite2DMaterialVariantKey(options: Sprite2DMaterialOptions = {}): string {
  const alphaTest = options.alphaTest ?? 0
  // alphaTest > 0 implies the depth-test fast path: opaque + depthWrite=true.
  const transparent = options.transparent ?? (alphaTest > 0 ? false : true)
  const lit = options.lit ?? false
  const ctId = getColorTransformId(options.colorTransform)
  const premultiplied = options.premultipliedAlpha ?? false
  const effectsKey = options.effectsKey ?? ''

  // Every option that changes the shader or blend state must be in the
  // key so distinct materials don't collide in the shared cache.
  return `${transparent}:${lit}:${ctId}:${alphaTest}:${premultiplied}:${effectsKey}`
}

/**
 * TSL-based material for 2D sprites.
 *
 * UNIFIED API: This material reads from instance attributes, which works for:
 * - Single sprites (Sprite2D sets attributes on its geometry)
 * - Batched sprites (SpriteBatch sets instanced attributes)
 *
 * Core instance attributes (always present):
 * - instanceUV (vec4): frame UV (x, y, width, height) in atlas
 * - instanceColor (vec4): tint color and alpha (r, g, b, a)
 * - instanceFlip (vec2): flip flags (x, y) where 1 = normal, -1 = flipped
 *
 * Effects are composed via `registerEffect()`, which packs effect data into
 * fixed-size vec4 buffers with per-sprite enable flags.
 */
export class Sprite2DMaterial extends EffectMaterial {
  /**
   * Canonical three.js class identifier — every built-in material
   * overrides this (MeshBasicMaterial's `type` is `'MeshBasicMaterial'`,
   * etc.). Devtools / inspectors that walk the scene graph read `.type`
   * to categorise materials without `instanceof` checks. Subclasses
   * (e.g. future `TileMapMaterial`) should override again.
   */
  override type: string = 'Sprite2DMaterial'

  /**
   * Cache of shared material instances, keyed by configuration.
   * Used by `getShared()` so sprites with identical config reuse the same material.
   */
  private static _cache = new Map<string, Sprite2DMaterial>()

  /**
   * Get a shared material instance for the given options.
   * Materials with identical configuration (texture, transparent, lit, colorTransform)
   * return the same instance, enabling automatic batching.
   */
  static getShared(options: Sprite2DMaterialOptions = {}): Sprite2DMaterial {
    const textureId = options.map?.id ?? -1
    const key = `${textureId}:${sprite2DMaterialVariantKey(options)}`

    let material = Sprite2DMaterial._cache.get(key)
    if (!material) {
      material = new Sprite2DMaterial(options)
      Sprite2DMaterial._cache.set(key, material)
    }
    return material
  }

  /**
   * Unique batch ID for this material instance (used for batching).
   */
  readonly batchId: number

  private _spriteTexture: Texture | null = null
  private _premultipliedAlpha: boolean = false
  private _globalUniforms: GlobalUniforms | null = null

  /**
   * Synthesized corner UV varying — replaces the geometry `uv()`
   * attribute (the synth-quad geometry ships no uv buffer). On the
   * tight-mesh strategy this is the geometry `uv()` node instead.
   * @internal
   */
  private _cornerUV: ReturnType<typeof synthQuadNodes>['cornerUV']

  /**
   * True while this material renders through the tight-mesh path:
   * alpha-blend (`transparent`, no alphaTest) with polygon data
   * registered for its texture. Fixed per shader build — a strategy
   * flip bumps `_effectSchemaVersion` so batches rebuild with matching
   * geometry.
   * @internal
   */
  _tightMesh = false

  /**
   * Registry `version` this material's current geometry strategy was
   * last resolved against. Lets `_resolveGeometryStrategy` notice a
   * merge/degrade that changed the atlas's CONTENT (new frames folded
   * in, or a `complete` flip) even when `_tightMesh` itself didn't
   * flip — a plain presence check can't see that, but a stale `version`
   * still means the batch's baked-at-construction envelope is wrong.
   * @internal
   */
  private _atlasMeshVersion = -1

  constructor(options: Sprite2DMaterialOptions = {}) {
    super({ effectTier: options.effectTier })

    this.batchId = nextMaterialId++

    // Synthesize the unit-quad corner from vertexIndex — pairs with the
    // index-only geometry from `createSynthQuadGeometry()`. Reclaims the
    // 3 vertex-buffer bindings PlaneGeometry cost (position/normal/uv),
    // which is what funds MAX_EFFECT_FLOATS = 24. `setTexture` may flip
    // the material to the tight-mesh strategy (geometry-driven position
    // + uv) when the texture's atlas registered polygon data.
    const synth = synthQuadNodes()
    this.positionNode = synth.position
    this._cornerUV = synth.cornerUV

    this._premultipliedAlpha = options.premultipliedAlpha ?? false
    this._globalUniforms = options.globalUniforms ?? null
    this._colorTransform = options.colorTransform ?? null

    // alphaTest > 0 opts the material into an opaque + depth-test fast
    // path. Transparent defaults flip to false and depthWrite flips to
    // true, so the GPU's depth buffer resolves draw order regardless of
    // instance slot order (the batchSortSystem's CPU sort is then
    // unnecessary and is skipped for this material).
    const alphaTest = options.alphaTest ?? 0
    this.alphaTest = alphaTest
    this.transparent = options.transparent ?? (alphaTest > 0 ? false : true)
    this.depthTest = true
    this.side = FrontSide

    if (this._premultipliedAlpha) {
      this.blending = CustomBlending
      this.blendSrc = OneFactor
      this.blendDst = OneMinusSrcAlphaFactor
      this.depthWrite = false
    } else {
      this.blending = NormalBlending
      // Opaque (transparent=false) materials write depth so the depth
      // test can resolve ordering — enables the alphaTest fast path.
      this.depthWrite = !this.transparent
    }

    if (options.map) {
      this.setTexture(options.map)
    }
  }

  /**
   * Sprite batches compose their instance transform in the custom
   * `positionNode`. Three.js evaluates hardware clip distances before that
   * position is available, so those distances describe the shared unit quad
   * instead of the transformed sprite. Keep clipping in the fragment stage,
   * where the view-position varying is produced after `positionNode` assigns
   * the synthesized, instance-transformed local position.
   *
   * @internal
   */
  override setupHardwareClipping(builder: NodeBuilder): void {
    const clippingBuilder = builder as NodeBuilder & { hardwareClipping: boolean }
    clippingBuilder.hardwareClipping = false
  }

  /**
   * Three r185 applies its built-in instance transform before assigning a
   * custom `positionNode`. The synthesized quad uses `positionNode`, so the
   * default order would overwrite the transformed position and collapse every
   * instance back to the shared unit quad. Assign the synthesized corner first,
   * then apply the instance matrix. Tight-mesh materials keep Three's default
   * setup path because they read their position from geometry.
   *
   * @internal
   */
  override setupPosition(builder: NodeBuilder): Node<'vec3'> {
    spritePixelPivot.assign(vec3(0))
    const object = builder.object as InstancedMesh
    const spriteBuilder = builder as SpriteNodeBuilder
    const isInstanced = object.isInstancedMesh && object.instanceMatrix.isInstancedBufferAttribute

    if (!isInstanced && this.positionNode === null) {
      super.setupPosition(builder)
    } else if (isInstanced && this.positionNode === null) {
      const geometry = builder.geometry
      if (geometry.morphAttributes.position || geometry.morphAttributes.normal || geometry.morphAttributes.color) {
        morphReference(object)
      }
      if ((object as InstancedMesh & { isSkinnedMesh?: boolean }).isSkinnedMesh === true) {
        skinning(object as never)
      }
      const displacement = this as Sprite2DMaterial & {
        displacementMap?: Texture | null
        displacementScale?: number
        displacementBias?: number
      }
      if (displacement.displacementMap) {
        // Three's public TSL factory types do not currently expose
        // MaterialReferenceNode as a vec4/scalar input even though the node
        // builder supports these canonical conversions at runtime.
        const displacementMap = vec4(materialReference('displacementMap', 'texture') as never)
        const displacementScale = float(materialReference('displacementScale', 'float') as never)
        const displacementBias = float(materialReference('displacementBias', 'float') as never)
        positionLocal.addAssign(
          normalLocal.normalize().mul(displacementMap.x.mul(displacementScale).add(displacementBias))
        )
      }
      if ((object as InstancedMesh & { isBatchedMesh?: boolean }).isBatchedMesh === true) {
        batch(object as never)
      }
    } else if (this.positionNode !== null) {
      positionLocal.assign(subBuild(this.positionNode, 'POSITION', 'vec3'))
    }

    if (isInstanced) applyInstanceTransform(spriteBuilder, object)

    return positionLocal
  }

  /**
   * Snap only the final projected sprite pivot to the physical framebuffer
   * grid. The same clip-space delta is applied to every vertex, preserving
   * authored scale and rotation and leaving CPU simulation transforms intact.
   * A dynamic branch keeps the opt-out path to a flag test without creating a
   * separate material or batch variant.
   *
   * @internal
   */
  override setupModelViewProjection(builder?: NodeBuilder): Node<'vec4'> {
    // Build through NodeMaterial's view-position extension point at the point
    // this clip expression is assembled. Using the shared `positionView` node
    // instead lets Three cache it before our custom instance-matrix stack is
    // emitted, which projects the untransformed unit quad for SpriteBatch.
    const viewPosition = this.setupPositionView(builder!) as Node<'vec3'>
    const clipPosition = cameraProjectionMatrix.mul(viewPosition).toVar('spriteClipPosition')

    If(readPixelPerfectFlag(), () => {
      const pivotClip = cameraProjectionMatrix.mul(modelViewMatrix.mul(spritePixelPivot)).toVar('spritePivotClip')
      If(pivotClip.w.greaterThan(0), () => {
        const pivotNdc = pivotClip.xy.div(pivotClip.w)
        const pivotPixels = pivotNdc.mul(0.5).add(0.5).mul(viewport.zw).add(viewport.xy)
        const snappedPixels = pivotPixels.add(0.5).floor()
        const deltaNdc = snappedPixels.sub(pivotPixels).div(viewport.zw).mul(2)
        clipPosition.xy.addAssign(deltaNdc.mul(clipPosition.w))
      })
    })

    return clipPosition
  }

  /**
   * Get the global uniforms reference.
   */
  get globalUniforms(): GlobalUniforms | null {
    return this._globalUniforms
  }

  /**
   * Set the global uniforms reference.
   * Triggers shader rebuild to include global tint.
   */
  set globalUniforms(value: GlobalUniforms | null) {
    if (this._globalUniforms === value) return
    this._globalUniforms = value
    if (this._spriteTexture) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Gate _rebuildColorNode() — skip if no texture is set yet.
   * @internal
   */
  protected override _canBuildColor(): boolean {
    return this._spriteTexture !== null
  }

  /**
   * Build the base color node for sprites.
   * Handles UV flip, atlas remapping, texture sampling, tint, and alpha test.
   * Called inside Fn() context by EffectMaterial._rebuildColorNode().
   * @internal
   */
  protected override _buildBaseColor(): { color: Node<'vec4'>; uv: Node<'vec2'> } | null {
    const mapTexture = this._spriteTexture!
    const globalUniforms = this._globalUniforms

    // Read from core instance attributes. Named helpers
    // (`readFlip`) hide the packed layout; see
    // `materials/instanceAttributes.ts` for the full accessor set.
    const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
    const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
    // Flip lives in instanceSystem.xy after the interleaved-buffer refactor.
    // `readFlip()` hides the packed layout (instanceSystem offset 0/1),
    // shared by the batched (writeFlip) and standalone (_updateOwnFlip) paths.
    const flip = readFlip()

    // Apply flip
    const baseUV = this._cornerUV
    const flippedUV = vec2(
      select(flip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
      select(flip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
    )

    // Unrotate frames packed 90° clockwise in the atlas (TexturePacker
    // rotation, system-flag bit 3): sprite-space (u, v) samples the
    // packed region at (v, 1 - u). Flip runs first — it's sprite-space.
    const rotated = readRotatedFrameFlag()
    const frameUV = vec2(
      select(rotated, flippedUV.y, flippedUV.x),
      select(rotated, float(1).sub(flippedUV.x), flippedUV.y)
    )

    // Remap to frame in atlas
    const atlasUV = frameUV.mul(vec2(instanceUV.z, instanceUV.w)).add(vec2(instanceUV.x, instanceUV.y))

    // Sample texture
    const texColor = texture(mapTexture, atlasUV)

    // Apply instance color (tint) and alpha
    let tintedRGB = texColor.rgb.mul(instanceColor.rgb)

    // Apply global tint if globalUniforms are wired
    if (globalUniforms) {
      tintedRGB = tintedRGB.mul(globalUniforms.globalTintNode)
    }

    const finalAlpha = texColor.a.mul(instanceColor.a)

    let color: Node<'vec4'>
    const alphaTestValue = this.alphaTest
    if (this._premultipliedAlpha) {
      if (alphaTestValue > 0) {
        If(finalAlpha.lessThan(float(alphaTestValue)), () => {
          Discard()
        })
      }
      color = vec4(tintedRGB.mul(finalAlpha), finalAlpha)
    } else {
      if (alphaTestValue > 0) {
        // User opt-in: apply to combined alpha so fades respect the cutoff.
        If(finalAlpha.lessThan(float(alphaTestValue)), () => {
          Discard()
        })
      } else {
        // Default near-zero cutoff is a "skip fully-transparent texels" perf
        // pass — check texel alpha alone so instance fade doesn't push
        // faintly-visible texels under the threshold and harden sprite edges.
        If(texColor.a.lessThan(float(0.01)), () => {
          Discard()
        })
      }
      color = vec4(tintedRGB, finalAlpha)
    }

    return { color, uv: atlasUV }
  }

  /**
   * Get the base sprite texture for channel providers.
   * @internal
   */
  protected override _getBaseTexture(): Texture | null {
    return this._spriteTexture
  }

  /**
   * Get the sprite texture.
   */
  getTexture(): Texture | null {
    return this._spriteTexture
  }

  /**
   * Set the sprite texture. Re-resolves the geometry strategy: an
   * alpha-blend material whose atlas registered polygon meshes flips to
   * the tight-mesh path (geometry position/uv instead of vertexIndex
   * synthesis). A flip bumps the schema version so existing batches
   * rebuild with matching geometry.
   */
  setTexture(value: Texture | null) {
    this._spriteTexture = value
    this._resolveGeometryStrategy()
    if (value) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Re-resolve the tight-mesh/synth-quad geometry strategy.
   *
   * @param deferRebuild - When true, skip the `_rebuildColorNode()` call
   * even if the strategy flipped. Set by `_beforeEffectCapCheck()`,
   * which runs mid-`registerEffect()` before the effect buffer tier is
   * resized — rebuilding the color node there would read `bufNodes` at
   * the OLD (too-small) tier and crash on an out-of-range buffer index
   * for the effect that just pushed floats past it. `registerEffect`
   * rebuilds the color node itself once the tier is correct; this just
   * needs `_tightMesh`/`positionNode`/`_cornerUV` updated beforehand so
   * that later rebuild picks up the demoted strategy.
   * @internal
   */
  _resolveGeometryStrategy(deferRebuild = false): void {
    const atlas = getAtlasMesh(this._spriteTexture)
    let wantsTight = this.transparent && this.alphaTest === 0 && atlas !== null && atlas.frames.length > 0
    if (wantsTight && this._effectTotalFloats > 16) {
      // Tight-mesh spends 2 bindings on geometry — a material already
      // carrying more than 16 effect floats can't fit under WebGPU's
      // 8-binding cap. Stay on synth-quad (correct, just no overdraw
      // win) rather than building an uncompilable pipeline.
      console.warn(
        'three-flatland: material carries more than 16 effect floats — staying on the ' +
          'synth-quad path instead of tight-mesh (WebGPU vertex-buffer budget).'
      )
      wantsTight = false
    }

    const strategyChanged = wantsTight !== this._tightMesh
    const atlasVersion = atlas?.version ?? -1
    // A second sheet merging into (or degrading) an already-registered
    // texture changes the envelope's CONTENT without flipping `wantsTight`
    // — the atlas was already non-null either way. Batches bake their
    // envelope once at construction (buildEnvelopeGeometry), so a stale
    // `version` here means their hull no longer matches the registry and
    // the rebuild channel below must still fire.
    const contentChanged = wantsTight && atlasVersion !== this._atlasMeshVersion
    if (!strategyChanged && !contentChanged) return

    this._tightMesh = wantsTight
    this._atlasMeshVersion = atlasVersion
    if (strategyChanged) {
      if (wantsTight) {
        // Geometry-driven path: default position pipeline (instancing
        // still applies downstream) + the geometry uv attribute.
        this.positionNode = null
        this._cornerUV = uv() as unknown as ReturnType<typeof synthQuadNodes>['cornerUV']
      } else {
        const synth = synthQuadNodes()
        this.positionNode = synth.position
        this._cornerUV = synth.cornerUV
      }
    }
    // Batches were built for the previous strategy (or the previous
    // envelope content) — force a rebuild through the same version
    // channel tier upgrades use. Rebuild the color node too when this
    // flip happens outside setTexture (late atlas registration
    // re-resolves through the version check).
    this._effectSchemaVersion++
    if (deferRebuild) return
    if (this._spriteTexture) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Effective effect-float cap for a prospective total. A tight-mesh
   * material demotes to synth-quad (cap 24) rather than staying tight
   * (cap 16) the moment its effect floats exceed 16, so a late effect
   * registration that crosses 16 is measured against the synth cap it
   * will actually run under — not thrown against the stale tight cap.
   * Recomputes `wantsTight` from scratch (not `_tightMesh`) so it stays
   * a pure query, safe on `registerEffect`'s throw path.
   * @internal
   */
  protected override _effectFloatCap(prospectiveTotal: number): number {
    const atlas = getAtlasMesh(this._spriteTexture)
    const wantsTight = this.transparent && this.alphaTest === 0 && atlas !== null && atlas.frames.length > 0
    return wantsTight && prospectiveTotal <= 16 ? 16 : EffectMaterial.MAX_EFFECT_FLOATS
  }

  /**
   * After an effect commits, re-resolve the geometry strategy so a
   * material that crossed the 16-float tight-mesh cap actually demotes to
   * synth-quad. Deferred rebuild: `registerEffect` resizes the buffer
   * tier and rebuilds the color node itself right after this returns, so
   * we only need `_tightMesh`/`positionNode`/`_cornerUV` updated here (see
   * `_resolveGeometryStrategy`). Runs on the success path only.
   * @internal
   */
  protected override _applyEffectGeometryStrategy(): void {
    this._resolveGeometryStrategy(true)
  }

  /**
   * Effect capacity depends on the geometry strategy: tight-mesh spends
   * 2 vertex-buffer bindings on geometry (position + uv), leaving 4
   * effect buffers = 16 floats under WebGPU's 8-binding cap; the
   * index-only synth quad leaves 6 buffers = 24 floats.
   * @internal
   */
  override get maxEffectFloats(): number {
    return this._tightMesh ? 16 : EffectMaterial.MAX_EFFECT_FLOATS
  }

  /**
   * The construction options that participate in the shared-cache /
   * variant key (`sprite2DMaterialVariantKey`), read back from live
   * material state. Re-resolution paths (enrollment bootstrap, dispose
   * resurrection, texture reassignment) rebuild a variant from these so
   * the resurrected material preserves every key-bearing flag — notably
   * `alphaTest` (opaque + depth fast-path) and `premultipliedAlpha`
   * (`CustomBlending`), both of which change the shader / blend state and
   * were previously dropped on re-resolution. `effectsKey` is owned by
   * the sprite's live effect set, so callers layer it on; `lit` is a key
   * discriminant the constructor never consumes, so it is intentionally
   * not reconstructable here.
   * @internal
   */
  get variantOptions(): Sprite2DMaterialOptions {
    return {
      transparent: this.transparent,
      colorTransform: this._colorTransform ?? undefined,
      alphaTest: this.alphaTest,
      premultipliedAlpha: this._premultipliedAlpha,
    }
  }

  /**
   * Clone this material.
   */
  override clone(): this {
    const cloned = new Sprite2DMaterial({
      map: this._spriteTexture ?? undefined,
      transparent: this.transparent,
      alphaTest: this.alphaTest,
      premultipliedAlpha: this._premultipliedAlpha,
      effectTier: this._defaultEffectTier,
      colorTransform: this._colorTransform ?? undefined,
      globalUniforms: this._globalUniforms ?? undefined,
    }) as this

    cloned._requiredChannels = this._requiredChannels

    // Copy effects (registers their packed slots and rebuilds colorNode)
    for (const effectClass of this._effects) {
      const constants = this._effectConstants.get(effectClass.effectName)
      ;(cloned as Sprite2DMaterial).registerEffect(effectClass, constants)
    }

    return cloned
  }

  dispose() {
    this._effects.length = 0
    this._instanceAttributes.clear()
    this._effectSlots.clear()
    this._effectBitIndex.clear()
    super.dispose()
  }
}
