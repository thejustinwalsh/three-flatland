import {
  Scene,
  OrthographicCamera,
  Color,
  type RenderTarget,
  Group,
  type Object3D,
  type ColorRepresentation,
  type Texture,
  Vector2,
  Vector4,
  NoColorSpace,
  SRGBColorSpace,
} from 'three'
import { RenderPipeline } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { pass, uv as uvNode, convertToTexture, uniform } from 'three/tsl'
import type { World, Entity } from 'koota'
import { SpriteGroup } from './pipeline/SpriteGroup'
import {
  declareSortLayer,
  getSortLayer,
  resolveSortLayer,
  type SortLayerConfig,
  type SortLayerName,
} from './pipeline/sortLayers'
import { GlobalUniforms } from './GlobalUniforms'
import { Sprite2D } from './sprites/Sprite2D'
import { TileMap2D } from './tilemap/TileMap2D'
import type { Sprite2DMaterial, ColorTransformFn } from './materials/Sprite2DMaterial'
import type { MaterialEffect } from './materials/MaterialEffect'
import type Node from 'three/src/nodes/core/Node.js'
import type PassNode from 'three/src/nodes/display/PassNode.js'
import type { WorldProvider } from './ecs/world'
import {
  PostPassTrait,
  PostPassRegistry,
  LightEffectTrait,
  LightingContext,
  ShadowPipeline,
  BatchRegistry,
} from './ecs/traits'
import { SDFGenerator } from './lights/SDFGenerator'
import { OcclusionPass } from './lights/OcclusionPass'
import { postPassSystem } from './ecs/systems/postPassSystem'
import { lightSyncSystem } from './ecs/systems/lightSyncSystem'
import { lightEffectSystem } from './ecs/systems/lightEffectSystem'
import { lightMaterialAssignSystem } from './ecs/systems/lightMaterialAssignSystem'
import { shadowPipelineSystem } from './ecs/systems/shadowPipelineSystem'
import type { PassEffect } from './pipeline/PassEffect'
import { Light2D } from './lights/Light2D'
import { LightStore } from './lights/LightStore'
import type { LightEffect } from './lights/LightEffect'
import { wrapWithLightFlags } from './lights/wrapWithLightFlags'
import type { ChannelName } from './materials/channels'
import type { RegistryData } from './ecs/batchUtils'
import { isDevtoolsActive } from './debug-protocol'
import { PERF_TRACK } from './debug/perf-track'
import type { DevtoolsProvider } from './debug/DevtoolsProvider'
import { beginDebugPass, endDebugPass } from './debug/debug-sink'
import { PixelPerfectCamera } from './cameras/PixelPerfectCamera'
import { getRendererViewportDepthRange, setRendererViewport } from './cameras/rendererViewport'
import { resolvePixelPerfect, type RenderingSetting } from './config/RenderingConfig'

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

/** Shape of the LightingContext trait data. */
interface LightingContextData {
  effect: LightEffect | null
  lightStore: LightStore | null
  lights: Light2D[]
  wrappedLightFn: ColorTransformFn | null
  requiredChannels: ReadonlySet<ChannelName>
  materials: Set<Sprite2DMaterial>
  dirty: boolean
  initialized: boolean
  surfaceSize: Vector2
  resizePending: boolean
  renderer: WebGPURenderer | null
  camera: OrthographicCamera | null
  scene: Scene | null
  worldSize: Vector2
  worldOffset: Vector2
}

// R3F restores a removed JSX property from a no-arg instance of the class.
// Remember every camera created for that default state so assigning one back
// can restore this instance's own managed camera instead of adopting a foreign
// default camera and permanently disabling automatic frustum updates.
const _flatlandInternalCameras = new WeakMap<OrthographicCamera, Flatland>()

/**
 * Options for creating a Flatland instance.
 */
export interface FlatlandOptions {
  /**
   * Human-readable name shown in the devtools consumer UI. Useful to
   * distinguish multiple Flatland instances (e.g. `name: 'main-game'`
   * vs `name: 'minimap'`) or a custom engine's provider from the
   * default. Default: `'flatland'`.
   */
  name?: string
  /**
   * Render target (null = render to viewport). Targets with NoColorSpace
   * default to sRGB; set LinearSRGBColorSpace explicitly for linear/HDR output.
   * Pass the target before its first GPU use so Three allocates the matching
   * attachment format.
   */
  renderTarget?: RenderTarget | null
  /**
   * Camera to use (null = use the internal orthographic camera). Flatland never
   * rewrites a supplied camera's frustum; its owner remains responsible for it.
   */
  camera?: OrthographicCamera | null
  /**
   * Use a managed {@link PixelPerfectCamera} when no custom camera is
   * supplied. The camera follows the physical drawing buffer or render target
   * and selects an integer world-to-pixel scale. This camera-only switch does
   * not change sprite or tile snapping; use {@link FlatlandConfig} or
   * {@link RenderingConfig} to change the rendering preset. Default: `true`.
   */
  pixelPerfect?: boolean
  /** Orthographic view size in pixels (default: 400) */
  viewSize?: number
  /**
   * Optional fixed horizontal design extent for the managed pixel camera.
   * Together with `viewSize`, this enables exact letterbox/pillarbox framing.
   * Omit it to reveal additional world space and fill the available output.
   */
  viewWidth?: number
  /** Clear before render (default: true) */
  autoClear?: boolean
  /** Background color */
  clearColor?: ColorRepresentation
  /** Background alpha (default: 1) */
  clearAlpha?: number
  /** Enable post-processing pipeline (default: false) */
  postProcessing?: boolean
  /**
   * Fixed aspect ratio for the regular managed camera. When omitted or set to
   * `'auto'`, Flatland derives the aspect from the renderer's viewport (or the
   * render target) when its dimensions change. A {@link PixelPerfectCamera}
   * always follows the physical output shape so it can preserve integer
   * scaling; letterbox at the renderer or layout level to pin that shape. A
   * camera supplied through `camera` keeps its authored frustum. Calling
   * resize() takes full manual size control; assigning `aspect = 'auto'`
   * restores automatic sizing.
   */
  aspect?: number | 'auto'
}

/**
 * Flatland - Unified 2D rendering pipeline for Three.js WebGPU.
 *
 * Combines sprite batching, post-processing, render targets, and global uniforms
 * into a single high-level API. Implements WorldProvider — one ECS world per Flatland
 * instance, shared between sprite batching and post-processing passes.
 *
 * @example
 * ```typescript
 * // Basic usage - render to viewport
 * const flatland = new Flatland({ viewSize: 400 })
 * flatland.add(new Sprite2D({ texture }))
 *
 * // Render loop
 * function animate() {
 *   flatland.render(renderer)
 *   requestAnimationFrame(animate)
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Render to texture
 * import { RenderTarget } from 'three'
 *
 * const target = new RenderTarget(512, 512)
 * const flatland = new Flatland({ renderTarget: target })
 * flatland.add(sprite)
 *
 * // Use texture on 3D mesh
 * mesh.material.map = flatland.texture
 *
 * // Render loop
 * flatland.render(renderer)  // Renders to target
 * renderer.render(scene3D, camera3D)  // Renders 3D with card
 * ```
 *
 * @example
 * ```tsx
 * // React Three Fiber usage
 * import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
 * import { Flatland, Sprite2D } from 'three-flatland/react'
 *
 * extend({ Flatland, Sprite2D })
 *
 * function Scene() {
 *   const flatlandRef = useRef<Flatland>(null)
 *   const { renderer } = useThree()
 *
 *   useFrame(() => {
 *     flatlandRef.current?.render(renderer)
 *   })
 *
 *   return (
 *     <flatland ref={flatlandRef} viewSize={400} clearColor={0x1a1a2e}>
 *       <sprite2D texture={texture} position={[0, 0, 0]} />
 *     </flatland>
 *   )
 * }
 * ```
 */
export class Flatland extends Group implements WorldProvider {
  /** Class-level rendering defaults, resolved before {@link RenderingConfig}. */
  static options: RenderingSetting | undefined = undefined

  /** Internal scene containing sprites */
  readonly scene: Scene

  /**
   * Declare (or redeclare) a named sort layer for use with
   * `sprite.sortLayer` and `SortLayerGroup`. Pair with a
   * `SortLayerRegistry` interface augmentation for typed names.
   */
  declareSortLayer(name: SortLayerName, config: SortLayerConfig): SortLayerConfig {
    return declareSortLayer(name, config)
  }

  /**
   * Resolve a declared sort layer's config — the hook for placing
   * foreign objects relative to a layer:
   *
   * ```ts
   * skiaText.renderOrder = flatland.sortLayer('ui').renderOrder - 1
   * ```
   */
  sortLayer(name: SortLayerName): SortLayerConfig {
    return getSortLayer(name) ?? { renderOrder: resolveSortLayer(name) }
  }

  /** Internal sprite group for batching */
  readonly spriteGroup: SpriteGroup

  /** Global uniforms shared across all sprite materials */
  readonly globals: GlobalUniforms = new GlobalUniforms()

  /** Camera for 2D rendering */
  private _camera: OrthographicCamera

  /** Orthographic view size */
  private _viewSize: number

  /** Optional fixed horizontal design extent for the pixel camera. */
  private _viewWidth: number | undefined

  /** Whether Flatland's managed camera uses integer pixel scaling. */
  private _pixelPerfect: boolean

  /** Current aspect ratio */
  private _aspect: number

  /**
   * Whether the camera aspect is derived from renderer/render-target size.
   * An explicit `aspect` option, property assignment, or `resize()` call
   * switches the camera to manual aspect control.
   */
  private _autoAspect: boolean

  /** Whether renderer/render-target dimensions are sampled each frame. */
  private _autoSurfaceSize = true

  /** Last valid render-surface size — skips redundant per-frame resize work */
  private _lastSyncedWidth = 0
  private _lastSyncedHeight = 0

  /** Force the next sync without discarding the last known physical surface. */
  private _surfaceSizeDirty = true

  /** Manual logical canvas size (or render-target texels) selected by resize(). */
  private _manualSurfaceWidth = 0
  private _manualSurfaceHeight = 0

  /** Whether resize() authored CSS pixels rather than render-target texels. */
  private _manualSizeIsLogical = true

  /** Whether the active camera is Flatland's managed internal camera. */
  private _ownsCamera: boolean

  /** Stable internal camera restored when R3F removes a custom camera prop. */
  private _internalCamera: OrthographicCamera

  /** Render target (null = viewport) */
  private _renderTarget: RenderTarget | null = null

  /** Render pipeline instance for post-processing */
  private _renderPipeline: RenderPipeline | null = null

  /** Pass node for post-processing input */
  private _passNode: PassNode | null = null

  /** Output node for post-processing effects */
  private _outputNode: Node | null = null

  /** Whether the render pipeline is enabled */
  private _renderPipelineEnabled: boolean

  /** Auto-clear before render */
  autoClear: boolean

  /** Clear color */
  clearColor: Color

  /** Clear alpha */
  clearAlpha: number

  /** Cached renderer reference */
  private _renderer: WeakRef<WebGPURenderer> | null = null

  /** Last render timestamp for delta time calculation (ms) */
  private _lastRenderTime = -1

  /** Whether the render pipeline was auto-initialized (vs. manual setRenderPipeline) */
  private _autoRenderPipeline = false

  /** Original auto-pass sizing method while Flatland supplies target dimensions. */
  private _autoPassNode: PassNode | null = null
  private _autoPassOriginalSetSize: PassNode['setSize'] | null = null
  private _autoPassWrappedSetSize: PassNode['setSize'] | null = null

  /** Reusable Vector2 to avoid per-frame allocations */
  private _tempVec2 = new Vector2()

  /** Reusable physical drawing-buffer size for surface-dependent GPU resources. */
  private _drawingBufferSize = new Vector2()

  /** Saved output viewport while a PixelPerfectCamera owns one render. */
  private _savedViewport = new Vector4()

  /** Saved WebGPU viewport depth range omitted by Three's Vector4 getter. */
  private _savedViewportDepthRange = new Vector2(0, 1)

  /** Reusable logical canvas viewport derived from physical camera pixels. */
  private _drawingBufferViewport = new Vector4()

  /** Pixel-camera sub-rectangle sampled from an auto pass's full-size target. */
  private _passViewportUvScale = uniform(new Vector2(1, 1))
  private _passViewportUvOffset = uniform(new Vector2(0, 0))

  /**
   * Camera frustum bounds as TSL uniform nodes. Created once per Flatland
   * instance so effect shaders can capture stable references at build
   * time. Updated in render() from the camera bounds each frame;
   * `.value` mutation doesn't require a shader rebuild.
   */
  private _worldSizeUniform = uniform(new Vector2(1, 1))
  private _worldOffsetUniform = uniform(new Vector2(0, 0))

  /** Active PassEffect instances */
  private _passes: PassEffect[] = []

  /** Auto-increment counter for insertion-ordered passes */
  private _nextPassOrder = 0

  /** ECS: registry singleton entity */
  private _postPassRegistryEntity: Entity | null = null

  /** Active Light2D objects */
  private _lights: Light2D[] = []

  /** Light data storage (lazy — created when first LightEffect is attached) */
  private _lightStore: LightStore | null = null

  /**
   * Shadow pipeline lives on the ECS `ShadowPipeline` singleton trait and
   * is managed end-to-end by `shadowPipelineSystem`. Flatland does not
   * hold SDFGenerator / OcclusionPass references — it only bootstraps
   * the singleton entity and registers the system in the schedule.
   */
  private _shadowPipelineEntity: Entity | null = null

  /** Active LightEffect instance */
  private _lightEffect: LightEffect | null = null

  /** ECS: LightingContext singleton entity */
  private _lightingContextEntity: Entity | null = null

  /** All sprite materials tracked for colorTransform assignment */
  private _spriteMaterials = new Set<Sprite2DMaterial>()

  /** Whether lighting systems are registered on the schedule */
  private _lightingSystemsRegistered = false

  constructor(options: FlatlandOptions = {}) {
    super()

    this.name = 'Flatland'

    // Create internal scene (separate from this Group for proper camera/rendering)
    // Disable automatic matrixWorld updates — Flatland manages transforms via
    // ECS systems and calls updateMatrixWorld explicitly. This prevents
    // renderer.render(scene) from re-running the ECS schedule through
    // SpriteGroup.updateMatrixWorld during internal passes (occlusion, SDF).
    this.scene = new Scene()
    this.scene.matrixWorldAutoUpdate = false

    // Create sprite group
    this.spriteGroup = new SpriteGroup()
    this.scene.add(this.spriteGroup)

    // Store view size and aspect. Omitted/invalid aspect = auto-derive from
    // the renderer (or render target) each render; valid explicit aspect = manual.
    const fixedAspect = options.aspect
    const hasFixedAspect = typeof fixedAspect === 'number' && Number.isFinite(fixedAspect) && fixedAspect > 0
    this._viewSize = this._isValidViewSize(options.viewSize) ? options.viewSize : 400
    this._viewWidth = this._isValidViewSize(options.viewWidth) ? options.viewWidth : undefined
    this._aspect = hasFixedAspect ? fixedAspect : 1
    this._autoAspect = !hasFixedAspect
    const classOptions = (this.constructor as typeof Flatland).options
    this._pixelPerfect = resolvePixelPerfect(options.pixelPerfect, classOptions)

    // Always retain an instance-owned camera so R3F can restore the no-arg
    // constructor default after a conditional custom camera prop is removed.
    this._internalCamera = this._createCamera()

    // Create or use provided camera
    if (options.camera) {
      this._camera = options.camera
      this._ownsCamera = false
    } else {
      this._camera = this._internalCamera
      this._ownsCamera = true
    }

    // Render target
    this._renderTarget = this._prepareRenderTarget(options.renderTarget ?? null)

    // Clear settings
    this.autoClear = options.autoClear ?? true
    this.clearColor = new Color(options.clearColor ?? 0x000000)
    this.clearAlpha = options.clearAlpha ?? 1

    // Background — set in render() based on clearAlpha (R3F sets props after construction)
    this.scene.background = this.clearColor

    // Render pipeline
    this._renderPipelineEnabled = options.postProcessing ?? false

    // Devtools producer — two-layer gate:
    //   1. The devtools build gate (build-time `process.env` expression) —
    //      folded to `false` in prod builds with no flags set, so the
    //      entire branch is dead code and tree-shakes out.
    //   2. `isDevtoolsActive()` (runtime, only read when bundled) — lets
    //      a user disable devtools on specific pages by setting
    //      `window.__FLATLAND_DEVTOOLS__ = false` before Flatland loads.
    //
    // Construction is pure (no I/O, no listeners, no announce). The
    // provider activates lazily on first `render()` call (see render()),
    // which works for both vanilla three.js (Flatland is the scene root,
    // never added to a parent) and React/R3F (discarded renders never
    // reach `render()`, so orphan Flatland instances stay inert and GC).
    // Cleanup happens in `dispose()` below.
    if ((process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true') && isDevtoolsActive()) {
      // Lazy-load the producer via dynamic import so a production build (gate
      // folded to `false`) dead-strips this `import()` and never bundles
      // DevtoolsProvider or its dependencies (BatchCollector, registries, the
      // bus worker). Construction stays pure; the provider lazy-starts on the
      // first render() once the chunk resolves (a microtask, before any frame).
      const name = options.name ?? 'flatland'
      void import('./debug/DevtoolsProvider').then(({ DevtoolsProvider }) => {
        if (this._disposed) return
        this._devtools = new DevtoolsProvider({ name, kind: 'system' })
      })
    }
  }

  /**
   * The ECS world for this Flatland instance.
   * Delegates to SpriteGroup's lazy-initialized world.
   */
  get world(): World {
    return this.spriteGroup.world
  }

  /**
   * Create internal orthographic camera.
   */
  private _createCamera(): OrthographicCamera {
    if (this._pixelPerfect) {
      const camera = new PixelPerfectCamera({ viewSize: this._viewSize, viewWidth: this._viewWidth })
      camera.setDrawingBufferSize(this._viewSize * this._aspect, this._viewSize)
      _flatlandInternalCameras.set(camera, this)
      return camera
    }

    const halfWidth = (this._viewSize * this._aspect) / 2
    const halfHeight = this._viewSize / 2

    const camera = new OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 1000)
    camera.position.z = 100
    _flatlandInternalCameras.set(camera, this)
    return camera
  }

  /**
   * Update camera frustum based on view size and aspect ratio.
   */
  private _updateCameraFrustum(): void {
    if (!this._ownsCamera) return

    if (this._camera instanceof PixelPerfectCamera) {
      this._camera.viewSize = this._viewSize
      this._camera.viewWidth = this._viewWidth
      const hasSurface = this._isValidSize(this._lastSyncedWidth, this._lastSyncedHeight)
      this._camera.setDrawingBufferSize(
        hasSurface ? this._lastSyncedWidth : this._viewSize * this._aspect,
        hasSurface ? this._lastSyncedHeight : this._viewSize
      )
      return
    }

    const halfWidth = (this._viewSize * this._aspect) / 2
    const halfHeight = this._viewSize / 2

    this._camera.left = -halfWidth
    this._camera.right = halfWidth
    this._camera.top = halfHeight
    this._camera.bottom = -halfHeight
    this._camera.updateProjectionMatrix()
  }

  /**
   * The camera flatland renders its internal scene with. Read-only
   * access for event integration (portal `events.compute` re-casts
   * pointer rays from this camera — spec §8.1) and debugging.
   */
  get camera(): OrthographicCamera {
    return this._camera
  }

  /**
   * Whether Flatland manages a {@link PixelPerfectCamera}. Toggling this while
   * a custom camera is active records the preferred internal-camera mode; the
   * custom camera remains untouched until it is removed.
   */
  get pixelPerfect(): boolean {
    return this._pixelPerfect
  }

  set pixelPerfect(value: boolean) {
    if (value === this._pixelPerfect) return
    const previous = this._internalCamera
    this._pixelPerfect = value
    const replacement = this._createCamera()
    replacement.position.copy(previous.position)
    replacement.quaternion.copy(previous.quaternion)
    replacement.scale.copy(previous.scale)
    replacement.up.copy(previous.up)
    replacement.near = previous.near
    replacement.far = previous.far
    replacement.zoom = previous.zoom
    replacement.layers.mask = previous.layers.mask
    replacement.name = previous.name
    replacement.updateProjectionMatrix()
    this._internalCamera = replacement
    if (this._ownsCamera) {
      this._setActiveCamera(this._internalCamera, true)
      this._updateCameraFrustum()
    }
  }

  /**
   * Set a custom camera. Assigning the default camera read from a no-arg
   * Flatland instance restores this instance's own managed camera; this is the
   * property-removal path used by React Three Fiber.
   */
  set camera(value: OrthographicCamera) {
    const internalOwner = _flatlandInternalCameras.get(value)
    const thisIsR3FManaged = '__r3f' in (this as Flatland & { __r3f?: unknown })
    const ownerIsR3FManaged =
      internalOwner !== undefined && '__r3f' in (internalOwner as Flatland & { __r3f?: unknown })
    // R3F restores a removed property from its memoized no-arg prototype,
    // whose Flatland instance is never reconciled or rendered. Only interpret
    // that camera as a sentinel while assigning to an R3F-managed instance;
    // vanilla Flatland instances can share an internal camera before either
    // one renders.
    const isR3FPrototypeCamera =
      thisIsR3FManaged && internalOwner !== undefined && !ownerIsR3FManaged && internalOwner._lastRenderTime < 0
    if (internalOwner === this || isR3FPrototypeCamera) {
      this._setActiveCamera(this._internalCamera, true)
      this._updateCameraFrustum()
      return
    }
    this._setActiveCamera(value, false)
  }

  /** Keep the auto post-processing pass in sync when the active camera changes. */
  private _setActiveCamera(camera: OrthographicCamera, ownsCamera: boolean): void {
    this._camera = camera
    this._ownsCamera = ownsCamera
    if (this._autoRenderPipeline && this._passNode) {
      this._passNode.camera = camera
    }
  }

  /**
   * Get the view size.
   */
  get viewSize(): number {
    return this._viewSize
  }

  /**
   * Set the view size.
   */
  set viewSize(value: number) {
    if (!this._isValidViewSize(value)) return
    this._viewSize = value
    this._updateCameraFrustum()
  }

  /** Fixed horizontal design extent, or undefined for fill-at-integer-scale. */
  get viewWidth(): number | undefined {
    return this._viewWidth
  }

  set viewWidth(value: number | undefined) {
    if (value !== undefined && !this._isValidViewSize(value)) return
    if (value === this._viewWidth) return
    this._viewWidth = value
    this._updateCameraFrustum()
  }

  /**
   * Get the configured aspect mode. Returns `'auto'` while Flatland follows
   * the render surface; use {@link resolvedAspect} for the camera's current
   * numeric ratio. A {@link PixelPerfectCamera} follows the physical output
   * shape even when this property retains a numeric regular-camera setting. A
   * user-supplied camera keeps its authored frustum regardless of this mode.
   */
  get aspect(): number | 'auto' {
    return this._autoAspect ? 'auto' : this._aspect
  }

  /**
   * Current numeric camera aspect. For Flatland's internal camera this includes
   * the ratio resolved in auto mode; for a user-supplied camera it is derived
   * directly from that camera's authored orthographic frustum.
   */
  get resolvedAspect(): number {
    if (!this._ownsCamera || this._camera instanceof PixelPerfectCamera) {
      const width = Math.abs(this._camera.right - this._camera.left)
      const height = Math.abs(this._camera.top - this._camera.bottom)
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return width / height
      }
    }
    return this._aspect
  }

  /**
   * A number pins the regular managed camera ratio manually. A
   * {@link PixelPerfectCamera} continues following the physical output shape;
   * the numeric value is retained in case `pixelPerfect` is later disabled.
   * Assigning `'auto'` restores automatic internal-camera and effect sizing,
   * including after `resize()`. User-supplied cameras keep their authored
   * frustum. The explicit sentinel also lets R3F restore constructor defaults
   * when an `aspect` JSX prop is removed. Invalid numeric values are ignored.
   */
  set aspect(value: number | 'auto') {
    if (value === 'auto') {
      this._autoAspect = true
      this._autoSurfaceSize = true
      this._manualSurfaceWidth = 0
      this._manualSurfaceHeight = 0
      this._manualSizeIsLogical = true
      // Force one fresh surface sync even when its dimensions happen to match
      // the previous manual size; the camera may still have a pinned ratio.
      this._surfaceSizeDirty = true
      return
    }
    if (!Number.isFinite(value) || value <= 0) return
    this._autoAspect = false
    this._autoSurfaceSize = true
    this._manualSurfaceWidth = 0
    this._manualSurfaceHeight = 0
    this._manualSizeIsLogical = true
    // A numeric aspect pins only the camera. If resize() previously selected
    // full manual surface control, resume physical surface tracking for GPU
    // resources and force a fresh sample on the next render.
    this._surfaceSizeDirty = true
    this._aspect = value
    this._updateCameraFrustum()
  }

  /**
   * Get the render target (null = viewport).
   */
  get renderTarget(): RenderTarget | null {
    return this._renderTarget
  }

  /**
   * Set the render target.
   */
  set renderTarget(value: RenderTarget | null) {
    this._renderTarget = this._prepareRenderTarget(value)
    if (!this._autoSurfaceSize) {
      this._surfaceSizeDirty = true
      if (
        this._renderTarget &&
        !this._manualSizeIsLogical &&
        this._isValidSize(this._manualSurfaceWidth, this._manualSurfaceHeight)
      ) {
        this._renderTarget.setSize(this._manualSurfaceWidth, this._manualSurfaceHeight)
      }
    }
    this._syncRenderPipelineOutputTransform()
  }

  /**
   * Get the render target texture (or null if rendering to viewport).
   */
  get texture(): Texture | null {
    return this._renderTarget?.texture ?? null
  }

  /**
   * Get the render pipeline instance.
   */
  get renderPipeline(): RenderPipeline | null {
    return this._renderPipeline
  }

  /**
   * Get the pass node for composing effects.
   */
  get passNode(): PassNode | null {
    return this._passNode
  }

  /**
   * Get/set the output node for post-processing effects.
   * Set this to apply TSL effect chains.
   */
  get outputNode(): Node | null {
    return this._outputNode
  }

  set outputNode(value: Node) {
    this._outputNode = value
    if (this._renderPipeline && value) {
      this._renderPipeline.outputNode = value
    }
  }

  /**
   * Add objects to Flatland.
   * Sprites are routed to the internal SpriteGroup for batching.
   * Other objects are added directly to the internal scene.
   *
   * This overrides Group.add() to route children to the internal scene
   * rather than this Group, enabling proper rendering with Flatland's camera.
   */
  add(...objects: Object3D[]): this {
    for (const child of objects) {
      if (child instanceof Sprite2D) {
        // Wire global uniforms to the material (shared by reference)
        if (!child.material.globalUniforms) {
          child.material.globalUniforms = this.globals
        }
        // Track all sprite materials
        this._spriteMaterials.add(child.material)
        // Apply wrapped lighting transform + channels from LightingContext
        const lctx = this._getLightingContext()
        if (lctx?.wrappedLightFn) {
          child.material.requiredChannels = lctx.requiredChannels
          child.material.colorTransform = lctx.wrappedLightFn
        }
        // Update LightingContext materials set
        if (lctx) {
          lctx.materials.add(child.material)
        }
        this.spriteGroup.add(child)
        // Defer validation to `render()` — by the time that runs, R3F has
        // mounted any MaterialEffect children (NormalMapProvider, etc.)
        // and imperative callers have finished their `addEffect` chain, so
        // we won't warn about effects that simply haven't landed yet.
        // We don't touch `child.onBeforeRender` — that callback slot
        // belongs to the user.
        this._pendingChannelValidation.add(child)
      } else if (child instanceof TileMap2D) {
        // Track tilemap layer materials for lighting
        const lctx = this._getLightingContext()
        for (const layer of child.getLayers()) {
          const mat = layer.material
          this._spriteMaterials.add(mat)
          if (lctx?.wrappedLightFn) {
            mat.requiredChannels = lctx.requiredChannels
            mat.colorTransform = lctx.wrappedLightFn
          }
          if (lctx) {
            lctx.materials.add(mat)
          }
        }
        this.scene.add(child)
      } else if (child instanceof Light2D) {
        // Track lights separately for the lighting system
        if (!this._lights.includes(child)) {
          this._lights.push(child)
        }
        // Update LightingContext lights array
        const lctx = this._getLightingContext()
        if (lctx) {
          lctx.lights = this._lights
        }
        this.scene.add(child)
      } else {
        // Add other objects directly to the internal scene
        this.scene.add(child)
      }
    }
    return this
  }

  /**
   * Remove objects from Flatland.
   * This overrides Group.remove() to properly remove from internal scene/spriteGroup.
   */
  remove(...objects: Object3D[]): this {
    for (const child of objects) {
      if (child instanceof Sprite2D) {
        this._spriteMaterials.delete(child.material)
        // Update LightingContext materials set
        const lctx = this._getLightingContext()
        if (lctx) {
          lctx.materials.delete(child.material)
        }
        this.spriteGroup.remove(child)
      } else if (child instanceof TileMap2D) {
        const lctx = this._getLightingContext()
        for (const layer of child.getLayers()) {
          this._spriteMaterials.delete(layer.material)
          if (lctx) {
            lctx.materials.delete(layer.material)
          }
        }
        this.scene.remove(child)
      } else if (child instanceof Light2D) {
        const idx = this._lights.indexOf(child)
        if (idx !== -1) this._lights.splice(idx, 1)
        // Update LightingContext lights array
        const lctx = this._getLightingContext()
        if (lctx) {
          lctx.lights = this._lights
        }
        this.scene.remove(child)
      } else {
        this.scene.remove(child)
      }
    }
    return this
  }

  /**
   * Remove all sprites and other objects from the internal scene.
   * Overrides Group.clear() to clear the internal scene.
   */
  clear(): this {
    this.spriteGroup.clear()

    // Clear any other objects from the scene (except spriteGroup)
    const toRemove: Object3D[] = []
    this.scene.traverse((obj) => {
      if (obj !== this.scene && obj !== this.spriteGroup && obj.parent === this.scene) {
        toRemove.push(obj)
      }
    })
    for (const obj of toRemove) {
      this.scene.remove(obj)
    }

    return this
  }

  /**
   * Initialize the render pipeline with a given RenderPipeline instance.
   * Users should create the RenderPipeline and pass node themselves for flexibility.
   *
   * @example
   * ```typescript
   * import { RenderPipeline, pass } from 'three/webgpu'
   * import { crtComplete } from 'three-flatland'
   *
   * const pipeline = new RenderPipeline(renderer)
   * const scenePass = pass(flatland.scene, flatland.camera)
   * pipeline.outputNode = crtComplete(scenePass, uv(), { curvature: 0.1 })
   *
   * flatland.setRenderPipeline(pipeline, scenePass)
   * ```
   * Flatland preserves the pipeline's outputColorTransform setting. Set it to
   * false when a manual pipeline writes working-space color to a render target.
   */
  setRenderPipeline(renderPipeline: RenderPipeline, passNode: PassNode): void {
    this._restoreAutoPassSize()
    this._renderPipeline = renderPipeline
    this._passNode = passNode
    this._outputNode = renderPipeline.outputNode
    this._renderPipelineEnabled = true
    this._autoRenderPipeline = false
  }

  /**
   * Clear the render pipeline setup.
   */
  clearRenderPipeline(): void {
    this._restoreAutoPassSize()
    this._renderPipeline = null
    this._passNode = null
    this._outputNode = null
    this._renderPipelineEnabled = false
    this._autoRenderPipeline = false
  }

  /**
   * Ensure the PostPassRegistry singleton entity exists in the world.
   */
  private _ensurePostPassRegistry(): void {
    if (!this._postPassRegistryEntity) {
      this._postPassRegistryEntity = this.world.spawn(PostPassRegistry({ dirty: false }))
    }
  }

  /**
   * Add a post-processing pass to the pipeline.
   * Passes are applied in insertion order (or explicit order). Automatically enables post-processing.
   *
   * @param passEffect - PassEffect instance to add
   * @param order - Optional explicit order (default: auto-increment)
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * import { CRTEffect, VignetteEffect } from 'three-flatland'
   *
   * const crt = new CRTEffect()
   * const vignette = new VignetteEffect()
   * flatland.addPass(crt).addPass(vignette)
   * crt.curvature = 0.3  // zero-cost uniform update
   * ```
   */
  addPass(passEffect: PassEffect, order?: number): this {
    if (this._passes.includes(passEffect)) return this

    this._ensurePostPassRegistry()

    // Set order and attach
    passEffect._order = order ?? this._nextPassOrder++
    passEffect._attach(this)

    // Build the pass function (calls static buildPass once, caches result)
    const fn = passEffect._buildPassFn()

    // Spawn ECS entity with PostPassTrait
    const ctor = passEffect.constructor as typeof PassEffect
    const entity = this.world.spawn(PostPassTrait({ fn, order: passEffect._order, enabled: passEffect.enabled }))

    // Add class-specific trait if schema has fields
    if (ctor._fields.length > 0) {
      // Build initial trait values from defaults
      const traitValues: Record<string, number> = {}
      for (const field of ctor._fields) {
        if (field.size === 1) {
          traitValues[field.name] = passEffect._defaults[field.name] as number
        } else {
          const arr = passEffect._defaults[field.name] as number[]
          for (let i = 0; i < field.size; i++) {
            traitValues[`${field.name}_${i}`] = arr[i]!
          }
        }
      }
      entity.add(ctor._trait(traitValues))
    }

    passEffect._entity = entity
    this._passes.push(passEffect)

    this._postPassRegistryEntity!.set(PostPassRegistry, { dirty: true })
    this._renderPipelineEnabled = true
    return this
  }

  /**
   * Remove a post-processing pass from the pipeline.
   *
   * @param passEffect - The same PassEffect instance passed to addPass()
   * @returns this (for chaining)
   */
  removePass(passEffect: PassEffect): this {
    const idx = this._passes.indexOf(passEffect)
    if (idx === -1) return this

    if (passEffect._entity) {
      passEffect._entity.destroy()
    }
    passEffect._detach()
    this._passes.splice(idx, 1)

    if (this._postPassRegistryEntity) {
      this._postPassRegistryEntity.set(PostPassRegistry, { dirty: true })
    }
    return this
  }

  /**
   * Remove all post-processing passes from the pipeline.
   * Disables post-processing if it was auto-initialized.
   *
   * @returns this (for chaining)
   */
  clearPasses(): this {
    for (const passEffect of this._passes) {
      if (passEffect._entity) {
        passEffect._entity.destroy()
      }
      passEffect._detach()
    }
    this._passes.length = 0
    this._nextPassOrder = 0

    if (this._postPassRegistryEntity) {
      this._postPassRegistryEntity.set(PostPassRegistry, { dirty: true })
    }

    if (this._autoRenderPipeline) {
      this._renderPipelineEnabled = false
    }
    return this
  }

  /**
   * Get the current post-processing passes.
   */
  get passes(): readonly PassEffect[] {
    return this._passes
  }

  /**
   * Mark the post-pass chain as structurally dirty.
   * Called by PassEffect.enabled setter.
   * @internal
   */
  _markPostPassDirty(): void {
    if (this._postPassRegistryEntity) {
      this._postPassRegistryEntity.set(PostPassRegistry, { dirty: true })
    }
  }

  // ============================================
  // Lighting
  // ============================================

  /**
   * Get the active Light2D instances.
   */
  get lights(): readonly Light2D[] {
    return this._lights
  }

  /**
   * Get the active LightEffect.
   */
  get lighting(): LightEffect | null {
    return this._lightEffect
  }

  /**
   * Set the lighting effect for this Flatland instance.
   * The LightEffect produces a ColorTransformFn that is applied to all lit sprites.
   *
   * Flatland owns the active effect's lifecycle while attached. Replacing it
   * or passing `null` calls `dispose()` before detachment so GPU resources are
   * released promptly. The effect instance remains reusable and will receive
   * a fresh `init → resize → update` sequence when reattached; callers should
   * not use effect-owned GPU resource handles while the effect is detached.
   *
   * @param lightEffect - LightEffect instance (or null to disable lighting)
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * import { DefaultLightEffect } from '@three-flatland/presets'
   *
   * const lighting = new DefaultLightEffect()
   * flatland.setLighting(lighting)
   * lighting.ambientIntensity = 0.4  // zero-cost uniform update
   * ```
   */
  setLighting(lightEffect: LightEffect | null): this {
    if (this._lightEffect === lightEffect) return this

    // Detach previous
    if (this._lightEffect) {
      // Flatland owns the active effect lifecycle. Release any GPU resources
      // before detaching so reusing the same instance later can safely init
      // against its next renderer without leaking the previous allocation.
      this._lightEffect.dispose()
      if (this._lightEffect._entity) {
        this._lightEffect._entity.destroy()
      }
      this._lightEffect._detach()
    }

    this._lightEffect = lightEffect

    if (lightEffect) {
      // Lazy-init LightStore
      if (!this._lightStore) {
        this._lightStore = new LightStore()
      }

      // Attach effect with dirty callback
      lightEffect._attach(this, () => {
        this._markLightingDirty()
      })

      // Store required channels from the effect class
      const ctor = lightEffect.constructor as typeof LightEffect

      // Ensure the ShadowPipeline singleton entity exists. For effects that
      // declare `needsShadows`, eagerly allocate the SDFGenerator +
      // OcclusionPass NOW (not on first system tick) so the sdfTexture
      // reference is bindable in buildLightFn's TSL `texture()` call. The
      // RTs are 1×1 placeholders at this point; shadowPipelineSystem
      // resizes them to the viewport on first frame.
      this._ensureShadowPipelineEntity()
      let sdfTexture: Texture | null = null
      if (ctor.needsShadows && this._shadowPipelineEntity) {
        const pipeline = this._shadowPipelineEntity.get(ShadowPipeline)
        if (pipeline) {
          if (!pipeline.sdfGenerator) pipeline.sdfGenerator = new SDFGenerator()
          if (!pipeline.occlusionPass) pipeline.occlusionPass = new OcclusionPass()
          sdfTexture = pipeline.sdfGenerator.sdfTexture
        }
      }

      // Build the colorTransform and wrap with per-instance lit-bit check.
      // The SDF texture reference passed here is stable — safe to close over
      // in TSL. World-bound uniforms are Flatland-owned so every effect
      // shares one update-path.
      const fn = lightEffect._buildLightFn(
        this._lightStore,
        this._worldSizeUniform,
        this._worldOffsetUniform,
        sdfTexture
      )
      const wrappedLightFn = wrapWithLightFlags(fn)

      const requiredChannels: ReadonlySet<ChannelName> = new Set(ctor.requires ?? [])

      // Spawn ECS entity for the effect
      const entity = this.world.spawn(LightEffectTrait({ fn, enabled: lightEffect.enabled }))

      // Add class-specific trait if schema has fields
      if (ctor._fields.length > 0) {
        const traitValues: Record<string, number> = {}
        for (const field of ctor._fields) {
          if (field.size === 1) {
            traitValues[field.name] = lightEffect._defaults[field.name] as number
          } else {
            const arr = lightEffect._defaults[field.name] as number[]
            for (let i = 0; i < field.size; i++) {
              traitValues[`${field.name}_${i}`] = arr[i]!
            }
          }
        }
        entity.add(ctor._trait(traitValues))
      }

      lightEffect._entity = entity

      // Spawn or update LightingContext singleton
      this._ensureLightingContext()
      const lctxEntity = this._lightingContextEntity!
      // Get existing context to preserve runtime fields
      const existingCtx = lctxEntity.get(LightingContext) as LightingContextData | undefined
      lctxEntity.set(LightingContext, {
        effect: lightEffect,
        lightStore: this._lightStore,
        lights: this._lights,
        wrappedLightFn,
        requiredChannels,
        materials: this._spriteMaterials,
        dirty: true,
        initialized: false,
        surfaceSize: existingCtx?.surfaceSize ?? new Vector2(),
        resizePending: false,
        renderer: existingCtx?.renderer ?? null,
        camera: existingCtx?.camera ?? null,
        scene: existingCtx?.scene ?? null,
        worldSize: existingCtx?.worldSize ?? new Vector2(),
        worldOffset: existingCtx?.worldOffset ?? new Vector2(),
      })
      if (this._lastSyncedWidth > 0 && this._lastSyncedHeight > 0) {
        this._queueLightEffectResize(this._lastSyncedWidth, this._lastSyncedHeight)
      }

      // Register lighting systems on the schedule (before sprite systems)
      this._ensureLightingSystems()

      // Dev-time: warn on any already-added lit sprite whose MaterialEffects
      // don't cover the lighting's declared channel `requires`. Without this,
      // missing providers silently fall back to channelDefaults (flat
      // normals, etc.) and "why does my lighting look wrong" takes an hour.
      this._validateLightingChannels()
    } else {
      // Clearing lighting
      if (this._lightingContextEntity) {
        const existingCtx = this._lightingContextEntity.get(LightingContext) as LightingContextData | undefined
        this._lightingContextEntity.set(LightingContext, {
          effect: null,
          lightStore: existingCtx?.lightStore ?? null,
          lights: existingCtx?.lights ?? [],
          wrappedLightFn: null,
          requiredChannels: new Set<ChannelName>(),
          materials: existingCtx?.materials ?? new Set(),
          dirty: true,
          initialized: false,
          surfaceSize: existingCtx?.surfaceSize ?? new Vector2(this._lastSyncedWidth, this._lastSyncedHeight),
          resizePending: false,
          renderer: existingCtx?.renderer ?? null,
          camera: existingCtx?.camera ?? null,
          scene: existingCtx?.scene ?? null,
          worldSize: existingCtx?.worldSize ?? new Vector2(),
          worldOffset: existingCtx?.worldOffset ?? new Vector2(),
        })
      }
    }

    return this
  }

  /**
   * Mark lighting as structurally dirty (effect enabled/disabled).
   * @internal Called by LightEffect.enabled setter and _onDirty callback.
   */
  _markLightingDirty(): void {
    if (this._lightingContextEntity) {
      const lctx = this._lightingContextEntity.get(LightingContext)
      if (lctx) {
        lctx.dirty = true
      }
    }
  }

  /** @internal Re-apply the active effect resolution scale. */
  _markLightingResizeDirty(): void {
    if (this._lastSyncedWidth > 0 && this._lastSyncedHeight > 0) {
      this._queueLightEffectResize(this._lastSyncedWidth, this._lastSyncedHeight)
    }
  }

  // ─── Shader rebuild ────────────────────────────────────────────────
  /**
   * Pending-rebuild guard. Coalesces multiple synchronous setter
   * calls inside one tick into a single `_doRebuildLightFn` run.
   * Without this, flipping N constants at once would trigger N
   * full TSL graph rebuilds.
   */
  private _shaderRebuildPending = false

  /**
   * Re-run the attached LightEffect's `_buildLightFn` and push the
   * fresh closure to every tracked lit material. Called from a
   * writable LightEffect constant setter when a compile-time toggle
   * changes (e.g. `glowEnabled`, `bandsEnabled`).
   *
   * Coalesces via microtask: the first call schedules, subsequent
   * synchronous calls are no-ops, the microtask runs once and reads
   * the latest constant values.
   *
   * @internal
   */
  _rebuildLightFn(): void {
    if (this._shaderRebuildPending) return
    this._shaderRebuildPending = true
    queueMicrotask(() => {
      this._shaderRebuildPending = false
      this._doRebuildLightFn()
    })
  }

  private _doRebuildLightFn(): void {
    const lightEffect = this._lightEffect
    if (!lightEffect || !this._lightStore || !this._lightingContextEntity) return
    const lctx = this._lightingContextEntity.get(LightingContext)
    if (!lctx) return

    let sdfTexture: Texture | null = null
    const ctor = lightEffect.constructor as typeof LightEffect
    if (ctor.needsShadows && this._shadowPipelineEntity) {
      const pipeline = this._shadowPipelineEntity.get(ShadowPipeline)
      if (pipeline?.sdfGenerator) sdfTexture = pipeline.sdfGenerator.sdfTexture
    }

    const fn = lightEffect._buildLightFn(this._lightStore, this._worldSizeUniform, this._worldOffsetUniform, sdfTexture)
    const wrappedLightFn = wrapWithLightFlags(fn)
    lctx.wrappedLightFn = wrappedLightFn
    // requiredChannels is `ctor.requires`, static readonly — never
    // changes between rebuilds. Don't reassign or the
    // `requiredChannels` setter on each material runs an extra
    // `_rebuildColorNode` (paired with the `colorTransform` setter's
    // own rebuild = double TSL build per material per push).
    lctx.dirty = true
  }

  /**
   * Ensure the LightingContext singleton entity exists.
   */
  private _ensureLightingContext(): void {
    if (!this._lightingContextEntity) {
      this._lightingContextEntity = this.world.spawn(
        LightingContext({
          effect: null,
          lightStore: null,
          lights: [],
          wrappedLightFn: null,
          requiredChannels: new Set(),
          materials: new Set(),
          dirty: false,
          initialized: false,
          surfaceSize: new Vector2(this._lastSyncedWidth, this._lastSyncedHeight),
          resizePending: false,
          renderer: null,
          camera: null,
          scene: null,
          worldSize: new Vector2(),
          worldOffset: new Vector2(),
        })
      )
    }
  }

  /**
   * Register lighting systems on the world's SystemSchedule.
   * Adds a `prepend()` to insert them before existing sprite systems.
   */
  private _ensureLightingSystems(): void {
    if (this._lightingSystemsRegistered) return
    this._lightingSystemsRegistered = true

    // Get the schedule from BatchRegistry
    const registry = this._getRegistry()
    if (!registry?.schedule) return

    // Prepend the light setup systems before sprite systems. shadowPipelineSystem
    // is APPENDED instead so it runs LAST — after conditionalTransformSyncSystem
    // has written current-frame instance matrices and flushDirtyRangesSystem has
    // uploaded them. This way the occluder pre-pass sees freshly-uploaded matrices
    // (fixes the 1-frame shadow lag on moving casters). The schedule's per-frame
    // idempotency + OcclusionPass._rendering guard handle the reentrant
    // renderer.render → updateMatrixWorld → schedule.run, so appending is safe.
    registry.schedule
      .add(shadowPipelineSystem, { track: PERF_TRACK.Lighting, name: 'shadowPipeline' })
      .prepend(lightMaterialAssignSystem, {
        track: PERF_TRACK.Lighting,
        name: 'lightMaterialAssign',
      })
      .prepend(lightEffectSystem, { track: PERF_TRACK.Lighting, name: 'lightEffect' })
      .prepend(lightSyncSystem, { track: PERF_TRACK.Lighting, name: 'lightSync' })
  }

  /**
   * Ensure the ShadowPipeline singleton entity exists. `shadowPipelineSystem`
   * owns the rest of its lifecycle — Flatland only bootstraps the trait so
   * the system has something to find on first run.
   */
  private _ensureShadowPipelineEntity(): void {
    if (this._shadowPipelineEntity) return
    this._shadowPipelineEntity = this.world.spawn(ShadowPipeline)
  }

  /**
   * WeakSet of sprites already warned about, so the same gap doesn't spam
   * the console every time a sprite is re-added or lighting is re-attached.
   */
  private _channelWarnedSprites: WeakSet<Sprite2D> = new WeakSet()
  private _pendingChannelValidation: Set<Sprite2D> = new Set()

  /**
   * Devtools producer — owns the BroadcastChannel, subscribers, stats,
   * env, scratch message buffers, and the tick-building logic.
   * Flatland coordinates timing (begin/end around render) but doesn't
   * hold the data.
   *
   * `null` outside of the devtools build gate && `isDevtoolsActive()`.
   * Prod builds with no flags have this as a single `null` field and the
   * entire subsystem tree-shakes out. See `debug-protocol.ts` for the
   * gate contract.
   */
  private _devtools: DevtoolsProvider | null = null
  /** Set in dispose() so a still-resolving lazy devtools import() bails. */
  private _disposed = false

  /**
   * Dev-only check: for the currently attached lighting effect's declared
   * channel `requires`, ensure every lit sprite has at least one
   * MaterialEffect with `provides` covering it.
   *
   * Missing providers silently fall back to `channelDefaults` at runtime
   * (flat normals, etc.) which makes lighting look "off" without any
   * actionable signal. This helper logs a focused warning per sprite
   * identifying the specific missing channels.
   *
   * @param sprite If provided, validate only this sprite; otherwise walk
   *               every sprite currently parented to the SpriteGroup.
   */
  /**
   * Drain `_pendingChannelValidation` — runs sprite-by-sprite validation for
   * everything queued by `add()`. Called from `render()` so by the time
   * validation runs, R3F has finished mounting MaterialEffect children and
   * imperative callers have completed their `addEffect` chain.
   *
   * Public-by-name (with leading `_` to mark internal) so tests and headless
   * use cases can drain without a renderer. Production code never needs to
   * call this directly — `render()` handles it.
   * @internal
   */
  _flushPendingChannelValidation(): void {
    if (this._pendingChannelValidation.size === 0) return
    for (const sprite of this._pendingChannelValidation) {
      this._validateLightingChannels(sprite)
    }
    this._pendingChannelValidation.clear()
  }

  private _validateLightingChannels(sprite?: Sprite2D): void {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    if (proc?.env?.['NODE_ENV'] === 'production') return
    const effect = this._lightEffect
    if (!effect) return
    const ctor = effect.constructor as typeof LightEffect
    const required = ctor.requires ?? []
    if (required.length === 0) return

    const check = (s: Sprite2D): void => {
      if (!s.lit) return
      if (this._channelWarnedSprites.has(s)) return

      const provided = new Set<ChannelName>()
      for (const eff of s._effects) {
        const effCtor = eff.constructor as typeof MaterialEffect
        for (const ch of effCtor.provides ?? []) provided.add(ch)
      }

      const missing = required.filter((ch) => !provided.has(ch))
      if (missing.length === 0) return

      this._channelWarnedSprites.add(s)
      const name = s.name || '<unnamed>'
      const lightName = (ctor as { lightName?: string }).lightName ?? ctor.name
      console.warn(
        `[flatland] Lit sprite "${name}" is missing channel provider(s) for: ${missing.join(', ')}. ` +
          `The active LightEffect "${lightName}" declares requires: [${required.join(', ')}]. ` +
          `Add a MaterialEffect that provides these channels (e.g. NormalMapProvider with a baked atlas, or use SpriteSheetLoader/LDtkLoader with \`normals: true\` to auto-bake). ` +
          `Forcing lit = false on this sprite so it renders unlit instead of falling back to ` +
          `zeroed channelDefaults and poisoning the scene's lighting shader.`
      )
      // Self-disable so the sprite renders unlit. Better a visibly-flat
      // sprite than a scene-wide lighting blowout from zeroed defaults.
      s.lit = false
    }

    if (sprite) {
      check(sprite)
      return
    }
    // Enumerate sprites via the ECS BatchRegistry — the canonical source of
    // sprite membership. Sprites enroll into the batch rather than becoming
    // scene-graph children, so spriteGroup.children is empty by design.
    const registry = this._getRegistry()
    if (!registry) return
    for (const s of registry.spriteArr) {
      if (s) check(s)
    }
  }

  /**
   * Get the LightingContext data from the world singleton.
   */
  private _getLightingContext() {
    if (!this._lightingContextEntity) return null
    return (this._lightingContextEntity.get(LightingContext) as LightingContextData | undefined) ?? null
  }

  /**
   * Get the BatchRegistry data from the world singleton.
   */
  private _getRegistry(): RegistryData | null {
    const registryEntities = this.world.query(BatchRegistry)
    if (registryEntities.length === 0) return null
    return (registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined) ?? null
  }

  /**
   * Render Flatland.
   */
  render(renderer: WebGPURenderer): void {
    // Drain pending lighting-channel validation before doing any real work.
    // Anything missing gets logged once and has `lit` force-cleared on that
    // sprite so it can't fall back to zeroed channelDefaults and poison the
    // lighting shader for the rest of the scene.
    this._flushPendingChannelValidation()

    // Devtools: lazy-start on first render(). Both vanilla three.js
    // (where Flatland is the scene root and 'added' never fires) and
    // React/R3F (where discarded renders never reach `render()`) get
    // safe activation here. `start()` is idempotent — no-op every
    // subsequent frame.
    this._devtools?.start()
    // Mark frame start before ANY renderer.render() calls this frame.
    // Flatland runs multiple internal render passes (SDF pass, occlusion
    // pass, main render, post-processing) — `beginFrame` + `endFrame`
    // aggregates them as ONE logical frame so FPS, cpuMs, draw calls and
    // triangles all report the actual user-visible frame stats, not
    // multiplied by pass count.
    this._devtools?.beginFrame(performance.now(), renderer)

    // Auto-sync global uniforms from renderer
    this._syncGlobals(renderer)

    // Keep render-surface dimensions current for the camera and lighting.
    // A fixed aspect only pins the camera; an explicit resize() selects full
    // manual surface control for both the camera and effects.
    this._syncSurfaceSize(renderer)

    // Update LightingContext runtime fields before systems run
    const lctx = this._getLightingContext()
    if (lctx) {
      lctx.renderer = renderer
      lctx.camera = this._camera
      lctx.scene = this.scene
      // worldSize/worldOffset are always live Vector2s (trait default +
      // preserved across setLighting); lightEffectSystem mutates them in
      // place each frame. No lazy allocation needed here.
    }

    // Sync the Flatland-owned world uniform nodes from the current camera
    // bounds so shader-side shadow / radiance math has live values. Mutation
    // on `.value` is free — no shader rebuild. The uniform references were
    // captured by effect shaders at setLighting time.
    const cam = this._camera
    this._worldSizeUniform.value.set(cam.right - cam.left, cam.top - cam.bottom)
    this._worldOffsetUniform.value.set(cam.left, cam.bottom)

    // ONE canonical trigger for the ECS schedule + matrix update per
    // frame. `scene.updateMatrixWorld(true)` walks into
    // `SpriteGroup.updateMatrixWorld`, which runs the schedule (all
    // lighting + sprite systems) exactly once, then recurses into
    // three.js matrix propagation. `scene.matrixWorldAutoUpdate` is
    // disabled at construction so internal passes (OcclusionPass, SDF)
    // don't trigger extra schedule runs.
    //
    // The `scheduleRuns` counter on the registry is kept as a defensive
    // guard — if any future path (user code, new internal pass) calls
    // `scene.updateMatrixWorld` or `spriteGroup.update` again in the
    // same frame, `SpriteGroup` observes the advanced counter and
    // short-circuits.
    this.scene.updateMatrixWorld(true)

    // Store renderer reference
    if (!this._renderer || this._renderer.deref() !== renderer) {
      this._renderer = new WeakRef(renderer)
    }

    // Auto-initialize or rebuild render pipeline if needed
    this._ensureRenderPipeline(renderer)

    // Bind the centered integer viewport before any direct or post-processed
    // draw. Canvas viewports are expressed in logical pixels; render-target
    // viewports already use physical texels. Restore user renderer state after
    // this Flatland render completes.
    const restorePixelViewport = this._applyPixelViewport(renderer)
    let currentRenderTarget: RenderTarget | null | undefined
    let renderTargetChanged = false

    try {
      // Bind Flatland's destination for both direct and post-processed
      // rendering. Keep target lookup/binding inside the restoration boundary:
      // a backend error here must not leak Flatland's pixel viewport.
      currentRenderTarget = renderer.getRenderTarget()
      renderTargetChanged = currentRenderTarget !== this._renderTarget
      if (renderTargetChanged) renderer.setRenderTarget(this._renderTarget)

      if (this._renderPipeline && this._renderPipelineEnabled) {
        beginDebugPass('main.post', renderer)
        try {
          this._renderPipeline.render()
        } finally {
          endDebugPass(renderer)
        }
      } else {
        // Sync scene.background based on clearAlpha (R3F sets props after construction)
        this.scene.background = this.clearAlpha < 1 ? null : this.clearColor

        // Configure renderer clear state and let render() handle clearing
        const prevAutoClear = renderer.autoClear
        renderer.autoClear = this.autoClear
        try {
          if (this.autoClear) {
            renderer.setClearColor(this.clearAlpha < 1 ? 0x000000 : this.clearColor, this.clearAlpha)
          }
          beginDebugPass('main', renderer)
          try {
            renderer.render(this.scene, this._camera)
          } finally {
            endDebugPass(renderer)
          }
        } finally {
          renderer.autoClear = prevAutoClear
        }
      }
    } finally {
      if (renderTargetChanged && currentRenderTarget !== undefined) {
        renderer.setRenderTarget(currentRenderTarget)
      }
      restorePixelViewport?.()
    }

    // Devtools: mark frame end after ALL renderer.render() calls have
    // completed this frame. Aggregates draw calls / triangles across
    // internal passes, computes real cpuMs and FPS at the logical
    // frame boundary, emits the data packet (or idle ping). The batch
    // registry snapshot is pulled via the sink source Flatland
    // registered in its constructor — no explicit capture call needed.
    this._devtools?.endFrame(renderer)
  }

  /**
   * Sync global uniforms from renderer state.
   * Called once per frame before rendering.
   */
  private _syncGlobals(renderer: WebGPURenderer): void {
    // Time — accumulate delta for auto mode
    const now = performance.now()
    if (this._lastRenderTime >= 0) {
      const delta = (now - this._lastRenderTime) / 1000
      this.globals.updateTime(delta)
    }
    this._lastRenderTime = now

    // Viewport size from renderer
    const size = renderer.getSize(this._tempVec2)
    this.globals.viewportSize = size

    // Pixel ratio from renderer
    this.globals.pixelRatio = renderer.getPixelRatio()
  }

  /**
   * Auto-initialize the render pipeline on first render if enabled,
   * and rebuild the pass chain when passes are added/removed.
   */
  private _ensureRenderPipeline(renderer: WebGPURenderer): void {
    // Nothing to do if render pipeline disabled and no passes
    if (!this._renderPipelineEnabled && this._passes.length === 0) return

    // Auto-initialize RenderPipeline if we have passes but no instance yet
    if (!this._renderPipeline && this._passes.length > 0) {
      const rp = new RenderPipeline(renderer)
      const scenePass = pass(this.scene, this._camera)
      this._installAutoPassSize(scenePass)
      this._renderPipeline = rp
      this._passNode = scenePass
      this._autoRenderPipeline = true
      this._renderPipelineEnabled = true

      // Mark dirty so the system rebuilds
      if (this._postPassRegistryEntity) {
        this._postPassRegistryEntity.set(PostPassRegistry, { dirty: true })
      }
    }

    this._syncAutoPassViewport()

    this._syncRenderPipelineOutputTransform()

    // Run postPassSystem to get sorted passes (returns null if not dirty)
    const sortedPasses = postPassSystem(this.world)
    if (sortedPasses && this._renderPipeline && this._passNode) {
      // PassNode's target stays full-surface sized, so sample only its active
      // pixel viewport. The uniforms are (1,1)/(0,0) for ordinary cameras.
      const uvCoord = uvNode()
      let node: Node<'vec4'> = convertToTexture(this._passNode).sample(
        uvCoord.mul(this._passViewportUvScale).add(this._passViewportUvOffset)
      )
      if (sortedPasses.length > 0) {
        for (const passFn of sortedPasses) {
          node = passFn(node, uvCoord)
        }
      }
      this._outputNode = node

      this._renderPipeline.outputNode = this._outputNode
      this._renderPipeline.needsUpdate = true
    }
  }

  /** Keep an auto scene pass and its sampling window on the pixel viewport. */
  private _syncAutoPassViewport(): void {
    if (!this._autoRenderPipeline || !this._passNode) return

    if (this._camera instanceof PixelPerfectCamera) {
      const viewport = this._camera.viewport
      this._passNode.setViewport(viewport)
      this._passViewportUvScale.value.set(
        viewport.width / this._camera.drawingBufferWidth,
        viewport.height / this._camera.drawingBufferHeight
      )
      this._passViewportUvOffset.value.set(
        viewport.x / this._camera.drawingBufferWidth,
        viewport.y / this._camera.drawingBufferHeight
      )
      return
    }

    // Three r185 explicitly supports `null` to restore automatic sizing; the
    // matching @types/three release omitted that documented overload.
    ;(this._passNode as PassNode & { setViewport(viewport: Vector4 | null): void }).setViewport(null)
    this._passViewportUvScale.value.set(1, 1)
    this._passViewportUvOffset.value.set(0, 0)
  }

  /**
   * PassNode normally allocates from the canvas drawing buffer even while the
   * renderer targets an offscreen surface. Keep its public `setSize` contract,
   * but substitute Flatland's target dimensions for the auto-owned pass.
   */
  private _installAutoPassSize(passNode: PassNode): void {
    this._restoreAutoPassSize()
    const original = passNode.setSize.bind(passNode)
    const wrapped: PassNode['setSize'] = (width, height) => {
      const target = this._renderTarget
      original(target?.width ?? width, target?.height ?? height)
    }
    this._autoPassNode = passNode
    this._autoPassOriginalSetSize = original
    this._autoPassWrappedSetSize = wrapped
    passNode.setSize = wrapped
  }

  /** Restore a pass before it becomes user-owned or is disposed. */
  private _restoreAutoPassSize(): void {
    if (
      this._autoPassNode &&
      this._autoPassOriginalSetSize &&
      this._autoPassWrappedSetSize &&
      this._autoPassNode.setSize === this._autoPassWrappedSetSize
    ) {
      this._autoPassNode.setSize = this._autoPassOriginalSetSize
    }
    this._autoPassNode = null
    this._autoPassOriginalSetSize = null
    this._autoPassWrappedSetSize = null
  }

  /** Keep the pipeline's final color transform aligned with its destination. */
  private _syncRenderPipelineOutputTransform(): void {
    if (!this._renderPipeline || !this._autoRenderPipeline) return

    // The default framebuffer needs the pipeline's display transform. Custom
    // targets receive working-space shader output: an sRGB attachment performs
    // its encode in hardware, while a linear/HDR attachment stores it directly.
    // Applying RenderPipeline's display transform as well would double-encode.
    const outputColorTransform = this._renderTarget === null
    if (this._renderPipeline.outputColorTransform !== outputColorTransform) {
      this._renderPipeline.outputColorTransform = outputColorTransform
      this._renderPipeline.needsUpdate = true
    }
  }

  /** Apply and later restore the active pixel camera's centered viewport. */
  private _applyPixelViewport(renderer: WebGPURenderer): (() => void) | null {
    if (!(this._camera instanceof PixelPerfectCamera)) return null

    const viewport = this._camera.viewport
    if (this._renderTarget) {
      const renderTarget = this._renderTarget
      this._savedViewport.copy(renderTarget.viewport)
      renderTarget.viewport.copy(viewport)
      return () => {
        renderTarget.viewport.copy(this._savedViewport)
      }
    }

    renderer.getViewport(this._savedViewport)
    getRendererViewportDepthRange(renderer, this._savedViewportDepthRange)
    const pixelRatio = renderer.getPixelRatio()
    setRendererViewport(
      renderer,
      this._camera.getLogicalViewport(pixelRatio, this._drawingBufferViewport),
      this._savedViewportDepthRange
    )
    return () => {
      setRendererViewport(renderer, this._savedViewport, this._savedViewportDepthRange)
    }
  }

  /** Apply Flatland's 2D-friendly default without overriding authored output. */
  private _prepareRenderTarget(renderTarget: RenderTarget | null): RenderTarget | null {
    if (renderTarget) {
      const textures = renderTarget.textures?.length ? renderTarget.textures : [renderTarget.texture]
      for (const texture of textures) {
        if (texture.colorSpace === NoColorSpace) texture.colorSpace = SRGBColorSpace
      }
    }
    return renderTarget
  }

  /**
   * Resize the rendering area, taking manual control of the aspect ratio and
   * surface size (the automatic per-render sync is disabled from here on).
   * The active destination fixes the authored unit for the whole manual-size
   * session. With no render target attached, dimensions are logical CSS pixels
   * and every later destination uses `width × renderer DPR`. With a render
   * target attached, dimensions are physical texels and remain physical across
   * later target swaps or a return to the canvas. Calling `resize()` again
   * begins a new session using the destination active at that time.
   *
   * Zero, negative, or non-finite dimensions are ignored — a transient
   * unmeasured layout (R3F's first commit reports a 0×0 canvas) must
   * not latch a NaN/Infinity frustum, and must not disable the
   * automatic sync that will pick up the real size once it exists.
   */
  resize(width: number, height: number): void {
    if (!this._isValidSize(width, height)) return
    this._autoAspect = false
    this._autoSurfaceSize = false
    this._manualSizeIsLogical = this._renderTarget === null
    this._applyResize(width, height)
  }

  /** Guard against zero/negative/NaN dimensions. */
  private _isValidSize(width: number, height: number): boolean {
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
  }

  /** Guard the authored vertical world span independently from surface size. */
  private _isValidViewSize(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value > 0
  }

  /**
   * Apply an explicit manual surface size. Dimensions are pre-validated.
   */
  private _applyResize(width: number, height: number): void {
    this._manualSurfaceWidth = width
    this._manualSurfaceHeight = height
    // The physical size depends on the next renderer DPR (or target), so force
    // one synchronization even when the authored dimensions did not change.
    this._surfaceSizeDirty = true
    this._aspect = width / height
    if (!(this._camera instanceof PixelPerfectCamera)) this._updateCameraFrustum()

    // Resize render target if needed
    if (this._renderTarget) {
      this._renderTarget.setSize(width, height)
    }
  }

  /**
   * Queue a LightEffect resize for the lighting lifecycle system. Keeping
   * resize in the system guarantees init() runs first and preserves the
   * current surface size for effects attached after the first frame.
   */
  private _queueLightEffectResize(width: number, height: number): void {
    const lctx = this._getLightingContext()
    if (!lctx) return
    const scale = this._lightEffect?.resolutionScale ?? 1
    lctx.surfaceSize.set(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)))
    lctx.resizePending = true
  }

  /**
   * Track the physical render surface every frame: the render target's texel
   * dimensions when rendering to texture, otherwise the renderer's drawing
   * buffer size (logical canvas size multiplied by pixel ratio).
   * Camera aspect follows while auto mode is active; LightEffect sizing
   * follows unless resize() selected full manual size control because GPU
   * tile buffers remain surface-dependent when only camera aspect is pinned.
   */
  private _syncSurfaceSize(renderer: WebGPURenderer): void {
    let width: number
    let height: number
    if (!this._autoSurfaceSize) {
      if (!this._isValidSize(this._manualSurfaceWidth, this._manualSurfaceHeight)) return
      if (!this._manualSizeIsLogical) {
        width = this._manualSurfaceWidth
        height = this._manualSurfaceHeight
      } else {
        const pixelRatio = renderer.getPixelRatio()
        if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return
        width = Math.floor(this._manualSurfaceWidth * pixelRatio)
        height = Math.floor(this._manualSurfaceHeight * pixelRatio)
      }
      if (this._renderTarget && (this._renderTarget.width !== width || this._renderTarget.height !== height)) {
        this._renderTarget.setSize(width, height)
      }
    } else if (this._renderTarget) {
      width = this._renderTarget.width
      height = this._renderTarget.height
    } else {
      renderer.getDrawingBufferSize(this._drawingBufferSize)
      width = this._drawingBufferSize.x
      height = this._drawingBufferSize.y
    }

    // Skip unmeasured/invalid surfaces (0×0 first R3F commit, NaN) and
    // frames where nothing changed — LightEffect.resize can reallocate
    // GPU tile buffers, so it must only fire on real size changes.
    if (!this._isValidSize(width, height)) return
    if (!this._surfaceSizeDirty && width === this._lastSyncedWidth && height === this._lastSyncedHeight) return

    this._lastSyncedWidth = width
    this._lastSyncedHeight = height
    this._surfaceSizeDirty = false
    if (this._autoAspect) {
      this._aspect = width / height
    }
    // PixelPerfectCamera always follows the physical surface even when an
    // authored numeric aspect is retained for the regular-camera fallback.
    // A fixed projection ratio cannot fill a differently-shaped framebuffer
    // without fractional scaling or renderer-level letterboxing.
    if (this._autoAspect || this._camera instanceof PixelPerfectCamera) this._updateCameraFrustum()
    this._queueLightEffectResize(width, height)
  }

  /**
   * Clone for devtools/serialization compatibility.
   * Flatland manages internal scene, camera, and render pipeline that
   * cannot be meaningfully cloned. Returns a Group with cloned children.
   */
  override clone(recursive?: boolean): this {
    const cloned = new Group()
    cloned.name = this.name || 'Flatland'
    cloned.visible = this.visible
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    if (recursive !== false) {
      for (const child of this.children) {
        cloned.add(child.clone(true))
      }
    }
    return cloned as unknown as this
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    // Tear down debug producers first — releases the scene.onAfterRender
    // hook so subsequent renders during dispose don't try to dispatch.
    this._disposed = true
    this._devtools?.dispose()
    this._devtools = null

    // Clear ECS pass entities before world destruction
    this.clearPasses()
    if (this._postPassRegistryEntity) {
      this._postPassRegistryEntity.destroy()
      this._postPassRegistryEntity = null
    }

    // Clear lighting
    if (this._lightEffect) {
      this._lightEffect.dispose()
      if (this._lightEffect._entity) {
        this._lightEffect._entity.destroy()
      }
      this._lightEffect._detach()
      this._lightEffect = null
    }
    if (this._lightingContextEntity) {
      this._lightingContextEntity.destroy()
      this._lightingContextEntity = null
    }
    this._lightStore?.dispose()
    this._lightStore = null
    // ShadowPipeline trait data is disposed by shadowPipelineSystem when
    // the effect detaches. Destroying the world during Flatland.dispose()
    // drops the singleton entity with it.
    if (this._shadowPipelineEntity) {
      const pipeline = this._shadowPipelineEntity.get(ShadowPipeline)
      pipeline?.sdfGenerator?.dispose()
      pipeline?.occlusionPass?.dispose()
      this._shadowPipelineEntity.destroy()
      this._shadowPipelineEntity = null
    }
    this._lights.length = 0
    this._spriteMaterials.clear()
    this._lightingSystemsRegistered = false

    this.spriteGroup.dispose()

    // Dispose render pipeline
    if (this._renderPipeline) {
      this._restoreAutoPassSize()
      this._renderPipeline.dispose?.()
      this._renderPipeline = null
    }
    this._autoRenderPipeline = false
  }
}
