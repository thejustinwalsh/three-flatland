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
import { select, type Entity, type World } from './ecs/runtime'
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
import {
  PostPassTrait,
  PostPassRegistry,
  LightEffectTrait,
  LightingContext,
  ShadowPipeline,
  BatchRegistry,
} from './ecs/traits'

const BatchRegistries = select(BatchRegistry)
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
import { validateExpectedSprites } from './internal/capacity'
import { isTerminalObject } from './internal/terminal-object'
import { getSpriteGroupWorld, registerSpriteGroupDisposeGuard } from './internal/sprite-group-runtime'
import { getEffectEntity, getEffectTrait, setEffectEntity } from './internal/effect-runtime'
import {
  subscribeSpriteDispose,
  subscribeSpriteMaterialChanges,
  subscribeTileMapDispose,
  subscribeTileMapMaterialRetention,
  subscribeTileMapMaterials,
} from './internal/ownership-observers'
import { disposeRetiredTileMaterialIfPending, holdTileMaterialRetirement } from './internal/tile-material-retirement'
import { restoreFlatlandMaterialState, retainFlatlandMaterialState } from './internal/flatland-material-state'

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

/** Canonical owners make Three-style live reparenting retire the previous Flatland first. */
const _flatlandSpriteOwners = new WeakMap<Sprite2D, Flatland>()
const _flatlandTileMapOwners = new WeakMap<TileMap2D, Flatland>()

/** One mutable material cannot safely point at two Flatland global-uniform sets. */
const _flatlandMaterialOwners = new WeakMap<Sprite2DMaterial, Flatland>()

/** Pass builders are user code and may try to attach the same instance elsewhere. */
const _preparingPassEffects = new WeakSet<PassEffect>()

/**
 * Options for creating a Flatland instance.
 */
export interface FlatlandOptions {
  /**
   * Advisory sprite count used to reserve the internal SpriteGroup's hot
   * CPU-side storage. It never limits enrollment or pre-creates GPU batches.
   * React Three Fiber users pass a stable options object through `args`
   * (for example, one created with `useMemo`) and reconstruct Flatland to
   * change it; it is intentionally not a mutable JSX property.
   */
  expectedSprites?: number
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
  /**
   * Clear before direct rendering (default: true). Three's post-processing
   * scene pass always clears its private target so effects never sample stale
   * frame data.
   */
  autoClear?: boolean
  /**
   * Background color used for Flatland-managed clears. A post-processing
   * pipeline preserves an explicit {@link Scene.background}; direct rendering
   * retains Flatland's historical managed-background behavior.
   */
  clearColor?: ColorRepresentation
  /**
   * Background alpha (default: 1). Direct rendering and post-processing both
   * preserve it, including offscreen targets. Fractional alpha uses
   * {@link clearColor}; alpha 0 clears to transparent black to prevent RGB
   * bleed when the result is filtered.
   */
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
 * into a single high-level API. Each instance privately owns the runtime shared
 * between sprite batching and post-processing passes.
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
export class Flatland extends Group {
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

  /** Shared child world retained so parent teardown survives reentrant child disposal. */
  private _sharedWorld: World | null = null

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

  /** Last background value managed from Flatland's clear settings. */
  private _managedSceneBackground: Color | null

  /** Cached renderer reference */
  private _renderer: WeakRef<WebGPURenderer> | null = null

  /** Last render timestamp for delta time calculation (ms) */
  private _lastRenderTime = -1

  /** Whether the render pipeline was auto-initialized (vs. manual setRenderPipeline) */
  private _autoRenderPipeline = false

  /** Original pass sizing method while Flatland supplies exact destination dimensions. */
  private _managedPassNode: PassNode | null = null
  private _managedPassOriginalSetSize: PassNode['setSize'] | null = null
  private _managedPassWrappedSetSize: PassNode['setSize'] | null = null

  /** Reusable Vector2 to avoid per-frame allocations */
  private _tempVec2 = new Vector2()

  /** Reusable physical drawing-buffer size for surface-dependent GPU resources. */
  private _drawingBufferSize = new Vector2()

  /** Shared-renderer clear color restored after Flatland's internal passes. */
  private _savedClearColor = new Color()

  /** Reusable physical canvas viewport inherited from the active renderer owner. */
  private _activeCanvasViewport = new Vector4()

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

  /** Reject nested addPass transactions on this Flatland. */
  private _passTransitioning = false

  /** Auto-increment counter for insertion-ordered passes */
  private _nextPassOrder = 0

  /** ECS: registry singleton entity */
  private _postPassRegistryEntity: Entity | null = null

  /** Active Light2D objects */
  private _lights: Light2D[] = []

  /** Light data storage (lazy — created when first LightEffect is attached) */
  private _lightStore: LightStore | null = null

  /**
   * Shadow pipeline runtime state lives on the ECS `ShadowPipeline` singleton
   * trait and is managed by `shadowPipelineSystem`. Flatland mirrors the GPU
   * ownership handles so its public SpriteGroup can dispose the shared world
   * first without making those resources unreachable to parent teardown.
   */
  private _shadowPipelineEntity: Entity | null = null
  private _shadowSdfGenerator: SDFGenerator | null = null
  private _shadowOcclusionPass: OcclusionPass | null = null
  private readonly _onShadowPipelineResourcesChanged = (
    sdfGenerator: SDFGenerator | null,
    occlusionPass: OcclusionPass | null
  ): void => {
    this._shadowSdfGenerator = sdfGenerator
    this._shadowOcclusionPass = occlusionPass
  }

  /** Active LightEffect instance */
  private _lightEffect: LightEffect | null = null

  /** Reject user-hook recursion across lighting publication and disposal. */
  private _lightingTransitioning = false

  /** Changes whenever terminal disposal starts so preparations can revalidate. */
  private _lifecycleRevision = 0

  /** ECS: LightingContext singleton entity */
  private _lightingContextEntity: Entity | null = null

  /** All sprite materials tracked for colorTransform assignment */
  private _spriteMaterials = new Set<Sprite2DMaterial>()

  /** Reference counts keep shared sprite/tile materials live until their last owner leaves. */
  private _spriteMaterialRefCounts = new Map<Sprite2DMaterial, number>()

  /** Live owner subscriptions make material replacement use the same tracking path as add/remove. */
  private _spriteMaterialSubscriptions = new Map<Sprite2D, () => void>()
  private _spriteDisposeSubscriptions = new Map<Sprite2D, () => void>()
  private _spriteOwnedMaterials = new Map<Sprite2D, Sprite2DMaterial>()
  private _tileMapMaterialSubscriptions = new Map<TileMap2D, () => void>()
  private _tileMapDisposeSubscriptions = new Map<TileMap2D, () => void>()
  private _tileMapOwnedMaterials = new Map<TileMap2D, readonly Sprite2DMaterial[]>()

  /** Whether lighting systems are registered on the schedule */
  private _lightingSystemsRegistered = false

  constructor(options: FlatlandOptions = {}) {
    const expectedSprites = validateExpectedSprites(options.expectedSprites)
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
    this.spriteGroup = new SpriteGroup({ expectedSprites })
    registerSpriteGroupDisposeGuard(this.spriteGroup, () => {
      if (!this._disposed) {
        throw new Error(
          'three-flatland: Flatland.spriteGroup.dispose() cannot run while its Flatland is live; call Flatland.dispose() instead'
        )
      }
    })
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
    this._managedSceneBackground = this.clearColor

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

  private get _runtimeWorld(): World {
    const world = getSpriteGroupWorld(this.spriteGroup)
    this._sharedWorld = world
    return world
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
    this._assertUsable('pixelPerfect')
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
    this._assertUsable('camera')
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
    this._assertUsable('viewSize')
    if (!this._isValidViewSize(value)) return
    this._viewSize = value
    this._updateCameraFrustum()
  }

  /** Fixed horizontal design extent, or undefined for fill-at-integer-scale. */
  get viewWidth(): number | undefined {
    return this._viewWidth
  }

  set viewWidth(value: number | undefined) {
    this._assertUsable('viewWidth')
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
    this._assertUsable('aspect')
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
    this._assertUsable('renderTarget')
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
    this._assertUsable('outputNode')
    this._outputNode = value
    if (this._renderPipeline && value) {
      this._renderPipeline.outputNode = value
    }
  }

  private _retainSpriteMaterial(material: Sprite2DMaterial): void {
    const count = this._spriteMaterialRefCounts.get(material) ?? 0
    if (count > 0) {
      this._spriteMaterialRefCounts.set(material, count + 1)
      return
    }

    const owner = _flatlandMaterialOwners.get(material)
    if (owner && owner !== this) {
      throw new Error(
        'Flatland.add: a Sprite2DMaterial cannot be shared by multiple Flatland instances; remove its existing owners first'
      )
    }

    retainFlatlandMaterialState(material)
    material.globalUniforms = this.globals
    const lctx = this._getLightingContext()
    if (lctx?.wrappedLightFn) {
      material.requiredChannels = lctx.requiredChannels
      material.colorTransform = lctx.wrappedLightFn
    }

    _flatlandMaterialOwners.set(material, this)
    this._spriteMaterialRefCounts.set(material, 1)
    this._spriteMaterials.add(material)
    lctx?.materials.add(material)
  }

  private _releaseSpriteMaterial(material: Sprite2DMaterial, deferRetirement = false): (() => void) | undefined {
    const count = this._spriteMaterialRefCounts.get(material)
    if (count === undefined) return
    if (count > 1) {
      this._spriteMaterialRefCounts.set(material, count - 1)
      return undefined
    }
    this._spriteMaterialRefCounts.delete(material)
    if (_flatlandMaterialOwners.get(material) === this) _flatlandMaterialOwners.delete(material)
    this._spriteMaterials.delete(material)
    this._getLightingContext()?.materials.delete(material)
    restoreFlatlandMaterialState(material)
    if (deferRetirement) return () => disposeRetiredTileMaterialIfPending(material)
    disposeRetiredTileMaterialIfPending(material)
    return undefined
  }

  private _assertCanAdoptMaterials(materials: readonly Sprite2DMaterial[], previousOwner?: Flatland): void {
    const proposedCounts = new Map<Sprite2DMaterial, number>()
    for (const material of materials) proposedCounts.set(material, (proposedCounts.get(material) ?? 0) + 1)
    for (const [material, proposedCount] of proposedCounts) {
      const owner = _flatlandMaterialOwners.get(material)
      if (!owner || owner === this) continue
      if (owner === previousOwner && owner._spriteMaterialRefCounts.get(material) === proposedCount) continue
      throw new Error(
        'Flatland.add: a Sprite2DMaterial cannot be shared by multiple Flatland instances; remove its existing owners first'
      )
    }
  }

  private _withMaterialTransferHolds<T>(
    materials: readonly Sprite2DMaterial[],
    enabled: boolean,
    transfer: () => T
  ): T {
    if (!enabled) return transfer()
    const unique = [...new Set(materials)]
    const releases = unique.map((material) => holdTileMaterialRetirement(material))
    let result: T | undefined
    let firstError: unknown
    let didError = false
    try {
      result = transfer()
    } catch (error) {
      firstError = error
      didError = true
    }
    for (const release of releases) release()
    for (const material of unique) {
      if (_flatlandMaterialOwners.has(material)) continue
      try {
        disposeRetiredTileMaterialIfPending(material)
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    if (didError) throw firstError
    return result as T
  }

  private _trackSprite(sprite: Sprite2D): void {
    const tracked = this._spriteOwnedMaterials.get(sprite)
    if (tracked !== sprite.material) {
      this._retainSpriteMaterial(sprite.material)
      this._spriteOwnedMaterials.set(sprite, sprite.material)
      if (tracked) this._releaseSpriteMaterial(tracked)
    }
    if (!this._spriteMaterialSubscriptions.has(sprite)) {
      const unsubscribe = subscribeSpriteMaterialChanges(sprite, (_previous, current) => {
        const owned = this._spriteOwnedMaterials.get(sprite)
        if (!owned || owned === current) return
        this._retainSpriteMaterial(current)
        this._spriteOwnedMaterials.set(sprite, current)
        const finalize = this._releaseSpriteMaterial(owned, true)
        return {
          finalize,
          rollback: () => {
            this._retainSpriteMaterial(owned)
            this._spriteOwnedMaterials.set(sprite, owned)
            this._releaseSpriteMaterial(current)
          },
        }
      })
      this._spriteMaterialSubscriptions.set(sprite, unsubscribe)
    }
    if (!this._spriteDisposeSubscriptions.has(sprite)) {
      const unsubscribe = subscribeSpriteDispose(sprite, () => {
        if (_flatlandSpriteOwners.get(sprite) === this) this.remove(sprite)
      })
      this._spriteDisposeSubscriptions.set(sprite, unsubscribe)
    }
    _flatlandSpriteOwners.set(sprite, this)
  }

  private _untrackSprite(sprite: Sprite2D): void {
    this._spriteMaterialSubscriptions.get(sprite)?.()
    this._spriteMaterialSubscriptions.delete(sprite)
    this._spriteDisposeSubscriptions.get(sprite)?.()
    this._spriteDisposeSubscriptions.delete(sprite)
    const material = this._spriteOwnedMaterials.get(sprite)
    this._spriteOwnedMaterials.delete(sprite)
    if (material) this._releaseSpriteMaterial(material)
    if (_flatlandSpriteOwners.get(sprite) === this) _flatlandSpriteOwners.delete(sprite)
  }

  private _trackTileMap(tileMap: TileMap2D): void {
    const previous = this._tileMapOwnedMaterials.get(tileMap) ?? []
    const materials = tileMap.getLayers().map((layer) => layer.material)
    const retained: Sprite2DMaterial[] = []
    try {
      for (const material of materials) {
        this._retainSpriteMaterial(material)
        retained.push(material)
      }
    } catch (error) {
      for (const material of retained) this._releaseSpriteMaterial(material)
      throw error
    }
    this._tileMapOwnedMaterials.set(tileMap, materials)
    for (const material of previous) this._releaseSpriteMaterial(material)

    if (!this._tileMapMaterialSubscriptions.has(tileMap)) {
      const unsubscribe = subscribeTileMapMaterials(tileMap, (_retired, current) => {
        const owned = this._tileMapOwnedMaterials.get(tileMap)
        if (!owned) return
        const retained: Sprite2DMaterial[] = []
        try {
          for (const material of current) {
            this._retainSpriteMaterial(material)
            retained.push(material)
          }
        } catch (error) {
          for (const material of retained) this._releaseSpriteMaterial(material)
          throw error
        }
        this._tileMapOwnedMaterials.set(tileMap, current)
        for (const material of owned) this._releaseSpriteMaterial(material)
        return new Set(owned.filter((material) => this._spriteMaterialRefCounts.has(material)))
      })
      const unsubscribeRetention = subscribeTileMapMaterialRetention(tileMap, (materials) => {
        return new Set(materials.filter((material) => (this._spriteMaterialRefCounts.get(material) ?? 0) > 1))
      })
      this._tileMapMaterialSubscriptions.set(tileMap, () => {
        unsubscribe()
        unsubscribeRetention()
      })
    }
    if (!this._tileMapDisposeSubscriptions.has(tileMap)) {
      const unsubscribe = subscribeTileMapDispose(tileMap, () => {
        if (_flatlandTileMapOwners.get(tileMap) === this) this.remove(tileMap)
      })
      this._tileMapDisposeSubscriptions.set(tileMap, unsubscribe)
    }
    _flatlandTileMapOwners.set(tileMap, this)
  }

  private _untrackTileMap(tileMap: TileMap2D): void {
    this._tileMapMaterialSubscriptions.get(tileMap)?.()
    this._tileMapMaterialSubscriptions.delete(tileMap)
    this._tileMapDisposeSubscriptions.get(tileMap)?.()
    this._tileMapDisposeSubscriptions.delete(tileMap)
    const materials = this._tileMapOwnedMaterials.get(tileMap)
    this._tileMapOwnedMaterials.delete(tileMap)
    if (materials) for (const material of materials) this._releaseSpriteMaterial(material)
    if (_flatlandTileMapOwners.get(tileMap) === this) _flatlandTileMapOwners.delete(tileMap)
  }

  /** Detach without redispatching user-extensible hierarchy events. */
  private _forceDetachChild(child: Object3D): void {
    if (child.parent !== this.scene) return
    const index = this.scene.children.indexOf(child)
    if (index !== -1) this.scene.children.splice(index, 1)
    child.parent = null
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
    this._assertUsable('add')
    for (const child of objects) {
      if (child instanceof Sprite2D) {
        if (isTerminalObject(child)) {
          throw new Error('Flatland.add: cannot add a disposed Sprite2D')
        }
        const previousOwner = _flatlandSpriteOwners.get(child)
        const transferring = previousOwner && previousOwner !== this ? previousOwner : undefined
        this._assertCanAdoptMaterials([child.material], transferring)
        this._withMaterialTransferHolds([child.material], transferring !== undefined, () => {
          try {
            if (transferring) transferring.remove(child)
            this.spriteGroup.add(child)
            this._trackSprite(child)
          } catch (error) {
            this.spriteGroup.remove(child)
            this._untrackSprite(child)
            if (transferring) {
              try {
                transferring.add(child)
              } catch {
                // Preserve the exact transfer failure after best-effort rollback.
              }
            }
            throw error
          }
        })
        // Defer validation to `render()` — by the time that runs, R3F has
        // mounted any MaterialEffect children (NormalMapProvider, etc.)
        // and imperative callers have finished their `addEffect` chain, so
        // we won't warn about effects that simply haven't landed yet.
        // We don't touch `child.onBeforeRender` — that callback slot
        // belongs to the user.
        this._pendingChannelValidation.add(child)
      } else if (child instanceof TileMap2D) {
        if (isTerminalObject(child)) {
          throw new Error('Flatland.add: cannot add a disposed TileMap2D')
        }
        const previousOwner = _flatlandTileMapOwners.get(child)
        const transferring = previousOwner && previousOwner !== this ? previousOwner : undefined
        const transferringMaterials = child.getLayers().map((layer) => layer.material)
        this._assertCanAdoptMaterials(transferringMaterials, transferring)
        this._withMaterialTransferHolds(transferringMaterials, transferring !== undefined, () => {
          try {
            if (transferring) transferring.remove(child)
            this.scene.add(child)
            this._trackTileMap(child)
          } catch (error) {
            this.scene.remove(child)
            this._untrackTileMap(child)
            if (transferring) {
              try {
                transferring.add(child)
              } catch {
                // Preserve the exact transfer failure after best-effort rollback.
              }
            }
            throw error
          }
        })
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
    this._assertUsable('remove')
    for (const child of objects) {
      if (child instanceof Sprite2D) {
        this._pendingChannelValidation.delete(child)
        try {
          this.spriteGroup.remove(child)
        } finally {
          // Three publishes the hierarchy removal before dispatching the
          // user-extensible `removed` event. Always retire ownership even
          // when an earlier listener throws.
          this._untrackSprite(child)
        }
      } else if (child instanceof TileMap2D) {
        try {
          this.scene.remove(child)
        } finally {
          // Three publishes the hierarchy removal before dispatching the
          // user-extensible `removed` event. Always retire material ownership
          // even when an earlier listener throws.
          this._untrackTileMap(child)
        }
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
    this._assertUsable('clear')
    let firstError: unknown
    let didError = false
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }

    const registryEntity = this._runtimeWorld.view(BatchRegistries)[0]
    const registry =
      registryEntity !== undefined
        ? (this._runtimeWorld.read(registryEntity, BatchRegistry) as RegistryData | undefined)
        : undefined
    const sprites = registry
      ? [...new Set(registry.spriteArr.filter((sprite): sprite is Sprite2D => sprite !== null))]
      : []
    const sceneChildren = this.scene.children.filter((child) => child !== this.spriteGroup)

    for (const sprite of sprites) runCleanup(() => this.remove(sprite))
    for (const child of sceneChildren) {
      runCleanup(() => this.remove(child))
      this._forceDetachChild(child)
    }
    // A hostile callback can reattach its child or publish a new one through
    // the public Scene. Canonical clear retains only Flatland's SpriteGroup.
    for (const child of this.scene.children.slice()) {
      if (child !== this.spriteGroup) this._forceDetachChild(child)
    }
    if (this.spriteGroup.parent !== this.scene) {
      const parent = this.spriteGroup.parent
      if (parent) {
        const index = parent.children.indexOf(this.spriteGroup)
        if (index !== -1) parent.children.splice(index, 1)
      }
      this.spriteGroup.parent = this.scene
    }
    if (!this.scene.children.includes(this.spriteGroup)) this.scene.children.push(this.spriteGroup)
    runCleanup(() => this.spriteGroup.clear())

    // Canonical removal above should empty every registry. These terminal
    // clears keep the contract first-error-safe if user hooks interrupted one.
    for (const unsubscribe of this._spriteMaterialSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._spriteDisposeSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._tileMapMaterialSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._tileMapDisposeSubscriptions.values()) runCleanup(unsubscribe)
    for (const sprite of this._spriteOwnedMaterials.keys()) {
      if (_flatlandSpriteOwners.get(sprite) === this) _flatlandSpriteOwners.delete(sprite)
    }
    for (const tileMap of this._tileMapOwnedMaterials.keys()) {
      if (_flatlandTileMapOwners.get(tileMap) === this) _flatlandTileMapOwners.delete(tileMap)
    }
    // Drain every logical owner through the canonical release path before
    // clearing registries. Pending generated tile materials (and their
    // textures) retire here even when user cleanup throws.
    for (const material of Array.from(this._spriteMaterialRefCounts.keys())) {
      this._spriteMaterialRefCounts.set(material, 1)
      runCleanup(() => this._releaseSpriteMaterial(material))
    }
    this._spriteMaterialSubscriptions.clear()
    this._spriteDisposeSubscriptions.clear()
    this._spriteOwnedMaterials.clear()
    this._tileMapMaterialSubscriptions.clear()
    this._tileMapDisposeSubscriptions.clear()
    this._tileMapOwnedMaterials.clear()
    this._spriteMaterialRefCounts.clear()
    this._spriteMaterials.clear()
    this._pendingChannelValidation.clear()
    this._lights.length = 0
    const lctx = this._getLightingContext()
    if (lctx) {
      lctx.materials.clear()
      lctx.lights = this._lights
    }

    if (didError) throw firstError
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
   * With a PixelPerfectCamera, Flatland sizes the supplied scene pass to the
   * camera's integer viewport so the pipeline cannot introduce a fractional
   * intermediate resample.
   */
  setRenderPipeline(renderPipeline: RenderPipeline, passNode: PassNode): void {
    this._assertUsable('setRenderPipeline')
    this._restoreManagedPassSize()
    this._renderPipeline = renderPipeline
    this._passNode = passNode
    this._outputNode = renderPipeline.outputNode
    this._renderPipelineEnabled = true
    this._autoRenderPipeline = false
    this._resetPassViewportSampling()
    this._installManagedPassSize(passNode)
  }

  /**
   * Clear the render pipeline setup.
   */
  clearRenderPipeline(): void {
    this._assertUsable('clearRenderPipeline')
    this._restoreManagedPassSize()
    this._renderPipeline = null
    this._passNode = null
    this._outputNode = null
    this._renderPipelineEnabled = false
    this._autoRenderPipeline = false
    this._resetPassViewportSampling()
  }

  /**
   * Ensure the PostPassRegistry singleton entity exists in the world.
   */
  private _ensurePostPassRegistry(): void {
    if (!this._postPassRegistryEntity) {
      this._postPassRegistryEntity = this._runtimeWorld.spawn(PostPassRegistry({ dirty: false }))
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
    if (this._disposed) throw new Error('three-flatland: addPass() cannot run after Flatland.dispose()')
    if (this._passTransitioning) {
      throw new Error('three-flatland: addPass() cannot run reentrantly on the same Flatland')
    }
    if (_preparingPassEffects.has(passEffect)) {
      throw new Error('three-flatland: PassEffect is already being prepared by another Flatland')
    }
    this._passTransitioning = true
    _preparingPassEffects.add(passEffect)
    try {
      return this._addPass(passEffect, order)
    } finally {
      _preparingPassEffects.delete(passEffect)
      this._passTransitioning = false
    }
  }

  private _addPass(passEffect: PassEffect, order?: number): this {
    if (this._disposed) {
      throw new Error('three-flatland: addPass() cannot run after Flatland.dispose()')
    }
    if (passEffect._flatland && passEffect._flatland !== this) {
      throw new Error(
        'three-flatland: PassEffect is already attached to another Flatland; remove it before attaching it here'
      )
    }
    if (this._passes.includes(passEffect)) return this

    // User builders are preparation, not publication. Build while the effect
    // is still detached so a throw cannot consume insertion order, create a
    // registry singleton, or strand an owner without an ECS entity.
    const previousPassFn = passEffect._passFn
    const lifecycleRevision = this._lifecycleRevision
    let fn: ReturnType<PassEffect['_buildPassFn']>
    try {
      fn = passEffect._buildPassFn()
    } catch (error) {
      passEffect._passFn = previousPassFn
      throw error
    }
    if (this._disposed || this._lifecycleRevision !== lifecycleRevision) {
      passEffect._passFn = previousPassFn
      throw new Error('three-flatland: dispose() cannot run reentrantly during addPass()')
    }
    if (this._passes.includes(passEffect) || passEffect._flatland !== null || getEffectEntity(passEffect) !== null) {
      passEffect._passFn = previousPassFn
      throw new Error('three-flatland: PassEffect ownership changed during pass preparation')
    }
    const resolvedOrder = order ?? this._nextPassOrder
    const ctor = passEffect.constructor as typeof PassEffect
    let traitValues: Record<string, number> | null = null
    if (ctor._fields.length > 0) {
      // Build initial trait values from defaults
      traitValues = Object.create(null) as Record<string, number>
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
    }

    const world = this._runtimeWorld
    const previousRegistryEntity = this._postPassRegistryEntity
    const previousOrder = passEffect._order
    const previousNextOrder = this._nextPassOrder
    const previousPipelineEnabled = this._renderPipelineEnabled
    let entity: Entity | null = null
    let registryEntity = previousRegistryEntity
    let registryCreated = false
    let attached = false
    try {
      // Fully populate a provisional entity before publishing ownership/order.
      entity = world.spawn(PostPassTrait({ fn, order: resolvedOrder, enabled: passEffect.enabled }))
      if (traitValues) {
        const runtimeTrait = getEffectTrait(ctor)
        world.add(entity, runtimeTrait(traitValues))
      }
      if (!registryEntity) {
        registryEntity = world.spawn(PostPassRegistry({ dirty: false }))
        registryCreated = true
      }

      passEffect._attach(this)
      attached = true
      passEffect._order = resolvedOrder
      setEffectEntity(passEffect, entity)
      this._postPassRegistryEntity = registryEntity
      world.patch(registryEntity, PostPassRegistry, { dirty: true })
      this._passes.push(passEffect)
      if (order === undefined) this._nextPassOrder++
      this._renderPipelineEnabled = true
    } catch (error) {
      const publishedIndex = this._passes.indexOf(passEffect)
      if (publishedIndex >= 0) this._passes.splice(publishedIndex, 1)
      this._nextPassOrder = previousNextOrder
      this._renderPipelineEnabled = previousPipelineEnabled
      this._postPassRegistryEntity = previousRegistryEntity
      if (attached) {
        try {
          passEffect._detach()
        } catch {}
      }
      passEffect._order = previousOrder
      setEffectEntity(passEffect, null)
      passEffect._passFn = previousPassFn
      if (entity && world.isAlive(entity)) {
        try {
          world.destroy(entity)
        } catch {}
      }
      if (registryCreated && registryEntity && world.isAlive(registryEntity)) {
        try {
          world.destroy(registryEntity)
        } catch {}
      }
      throw error
    }

    return this
  }

  /**
   * Remove a post-processing pass from the pipeline.
   *
   * @param passEffect - The same PassEffect instance passed to addPass()
   * @returns this (for chaining)
   */
  removePass(passEffect: PassEffect): this {
    this._assertUsable('removePass')
    const idx = this._passes.indexOf(passEffect)
    if (idx === -1) return this

    const passEntity = getEffectEntity(passEffect)
    if (passEntity) {
      this._runtimeWorld.destroy(passEntity)
    }
    passEffect._detach()
    this._passes.splice(idx, 1)

    if (this._postPassRegistryEntity) {
      this._runtimeWorld.patch(this._postPassRegistryEntity, PostPassRegistry, { dirty: true })
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
    this._assertUsable('clearPasses')
    for (const passEffect of this._passes) {
      const passEntity = getEffectEntity(passEffect)
      if (passEntity) {
        this._runtimeWorld.destroy(passEntity)
      }
      passEffect._detach()
    }
    this._passes.length = 0
    this._nextPassOrder = 0

    if (this._postPassRegistryEntity) {
      this._runtimeWorld.patch(this._postPassRegistryEntity, PostPassRegistry, { dirty: true })
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
    if (this._disposed) return
    if (this._postPassRegistryEntity) {
      this._runtimeWorld.patch(this._postPassRegistryEntity, PostPassRegistry, { dirty: true })
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
    if (this._disposed) {
      throw new Error('three-flatland: setLighting() cannot run after Flatland.dispose()')
    }
    if (this._lightingTransitioning) {
      throw new Error('three-flatland: setLighting() cannot run reentrantly during a lighting transition')
    }
    this._lightingTransitioning = true
    try {
      return this._setLighting(lightEffect)
    } finally {
      this._lightingTransitioning = false
    }
  }

  private _setLighting(lightEffect: LightEffect | null): this {
    if (lightEffect?._flatland && lightEffect._flatland !== this) {
      throw new Error(
        'three-flatland: LightEffect is already attached to another Flatland; clear it before attaching it here'
      )
    }
    if (this._lightEffect === lightEffect) return this

    if (!lightEffect) {
      const previous = this._lightEffect
      if (previous) {
        previous.dispose()
        if (this._sharedWorld?.disposed) {
          throw new Error('three-flatland: Flatland.spriteGroup.dispose() cannot run during setLighting()')
        }
        const previousEntity = getEffectEntity(previous)
        if (previousEntity) this._runtimeWorld.destroy(previousEntity)
        previous._detach()
      }
      this._lightEffect = null
      if (this._lightingContextEntity) {
        const existingCtx = this._runtimeWorld.read(this._lightingContextEntity, LightingContext) as
          | LightingContextData
          | undefined
        this._runtimeWorld.patch(this._lightingContextEntity, LightingContext, {
          effect: null,
          lightStore: existingCtx?.lightStore ?? null,
          lights: existingCtx?.lights ?? [],
          wrappedLightFn: null,
          requiredChannels: new Set<ChannelName>(),
          materials: existingCtx?.materials ?? new Set<Sprite2DMaterial>(),
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
      return this
    }

    const previous = this._lightEffect
    const world = this._runtimeWorld
    const ctor = lightEffect.constructor as typeof LightEffect
    let preparedLightStore = this._lightStore
    let createdLightStore = false
    let preparedSdfGenerator: SDFGenerator | null = null
    let preparedOcclusionPass: OcclusionPass | null = null
    let effectEntity: Entity | null = null
    let shadowEntity = this._shadowPipelineEntity
    let shadowCreated = false
    let contextEntity = this._lightingContextEntity
    let contextCreated = false
    const assertLightingWorldLive = (): void => {
      if (world.disposed) {
        throw new Error('three-flatland: Flatland.spriteGroup.dispose() cannot run during setLighting()')
      }
    }

    const discardPrepared = (): void => {
      lightEffect._lightFn = null
      try {
        preparedSdfGenerator?.dispose()
      } catch {}
      try {
        preparedOcclusionPass?.dispose()
      } catch {}
      if (createdLightStore) {
        try {
          preparedLightStore?.dispose()
        } catch {}
      }
      if (effectEntity && world.isAlive(effectEntity)) {
        try {
          world.destroy(effectEntity)
        } catch {}
      }
      if (contextCreated && contextEntity && world.isAlive(contextEntity)) {
        try {
          world.destroy(contextEntity)
        } catch {}
      }
      if (shadowCreated && shadowEntity && world.isAlive(shadowEntity)) {
        try {
          world.destroy(shadowEntity)
        } catch {}
      }
    }

    let fn: ReturnType<LightEffect['_buildLightFn']>
    let wrappedLightFn: ReturnType<typeof wrapWithLightFlags>
    let requiredChannels: ReadonlySet<ChannelName>
    try {
      if (!preparedLightStore) {
        preparedLightStore = new LightStore()
        createdLightStore = true
      }

      let sdfTexture: Texture | null = null
      if (ctor.needsShadows) {
        const existingPipeline = shadowEntity ? world.read(shadowEntity, ShadowPipeline) : undefined
        if (!existingPipeline?.sdfGenerator) preparedSdfGenerator = new SDFGenerator()
        if (!existingPipeline?.occlusionPass) preparedOcclusionPass = new OcclusionPass()
        sdfTexture = existingPipeline?.sdfGenerator?.sdfTexture ?? preparedSdfGenerator!.sdfTexture
      }

      fn = lightEffect._buildLightFn(preparedLightStore, this._worldSizeUniform, this._worldOffsetUniform, sdfTexture)
      assertLightingWorldLive()
      wrappedLightFn = wrapWithLightFlags(fn)
      requiredChannels = new Set(ctor.requires ?? [])

      let traitValues: Record<string, number> | null = null
      if (ctor._fields.length > 0) {
        traitValues = Object.create(null) as Record<string, number>
        for (const field of ctor._fields) {
          if (field.size === 1) {
            traitValues[field.name] = lightEffect._defaults[field.name] as number
          } else {
            const arr = lightEffect._defaults[field.name] as number[]
            for (let i = 0; i < field.size; i++) traitValues[`${field.name}_${i}`] = arr[i]!
          }
        }
      }

      // Every entity is provisional until the previous effect has disposed.
      effectEntity = world.spawn(LightEffectTrait({ fn, enabled: lightEffect.enabled }))
      if (traitValues) {
        const runtimeTrait = getEffectTrait(ctor)
        world.add(effectEntity, runtimeTrait(traitValues))
      }
      if (!shadowEntity) {
        shadowEntity = world.spawn(ShadowPipeline({ onResourcesChanged: this._onShadowPipelineResourcesChanged }))
        shadowCreated = true
      }
      if (!contextEntity) {
        contextEntity = world.spawn(
          LightingContext({
            effect: null,
            lightStore: null,
            lights: [],
            wrappedLightFn: null,
            requiredChannels: new Set(),
            materials: new Set<Sprite2DMaterial>(),
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
        contextCreated = true
      }

      if (this._lightEffect !== previous || lightEffect._flatland !== null || getEffectEntity(lightEffect) !== null) {
        throw new Error('three-flatland: lighting ownership changed during effect preparation')
      }

      // User disposal remains pre-publication. A throw rolls every candidate
      // allocation/cache back and leaves the current owner/context authoritative.
      previous?.dispose()
      assertLightingWorldLive()
      if (this._lightEffect !== previous || lightEffect._flatland !== null || getEffectEntity(lightEffect) !== null) {
        throw new Error('three-flatland: lighting ownership changed during previous-effect disposal')
      }
    } catch (error) {
      discardPrepared()
      throw error
    }

    const previousEntity = previous ? getEffectEntity(previous) : null
    if (previousEntity) world.destroy(previousEntity)
    previous?._detach()

    const pipeline = world.read(shadowEntity!, ShadowPipeline)
    if (pipeline) {
      if (preparedSdfGenerator) pipeline.sdfGenerator = preparedSdfGenerator
      if (preparedOcclusionPass) pipeline.occlusionPass = preparedOcclusionPass
      pipeline.onResourcesChanged = this._onShadowPipelineResourcesChanged
      this._onShadowPipelineResourcesChanged(pipeline.sdfGenerator, pipeline.occlusionPass)
    }

    lightEffect._attach(this, () => {
      this._markLightingDirty()
    })
    setEffectEntity(lightEffect, effectEntity)
    this._lightStore = preparedLightStore
    this._shadowPipelineEntity = shadowEntity
    this._lightingContextEntity = contextEntity
    this._lightEffect = lightEffect

    const existingCtx = world.read(contextEntity!, LightingContext) as LightingContextData | undefined
    world.patch(contextEntity!, LightingContext, {
      effect: lightEffect,
      lightStore: preparedLightStore,
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
    this._ensureLightingSystems()
    this._validateLightingChannels()
    return this
  }

  /**
   * Mark lighting as structurally dirty (effect enabled/disabled).
   * @internal Called by LightEffect.enabled setter and _onDirty callback.
   */
  _markLightingDirty(): void {
    if (this._disposed) return
    if (this._lightingContextEntity) {
      const lctx = this._runtimeWorld.read(this._lightingContextEntity, LightingContext)
      if (lctx) {
        lctx.dirty = true
      }
    }
  }

  /** @internal Re-apply the active effect resolution scale. */
  _markLightingResizeDirty(): void {
    if (this._disposed) return
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
    if (this._disposed) return
    if (this._shaderRebuildPending) return
    this._shaderRebuildPending = true
    queueMicrotask(() => {
      this._shaderRebuildPending = false
      this._doRebuildLightFn()
    })
  }

  private _doRebuildLightFn(): void {
    if (this._disposed) return
    const lightEffect = this._lightEffect
    if (!lightEffect || !this._lightStore || !this._lightingContextEntity) return
    const lctx = this._runtimeWorld.read(this._lightingContextEntity, LightingContext)
    if (!lctx) return

    let sdfTexture: Texture | null = null
    const ctor = lightEffect.constructor as typeof LightEffect
    if (ctor.needsShadows && this._shadowPipelineEntity) {
      const pipeline = this._runtimeWorld.read(this._shadowPipelineEntity, ShadowPipeline)
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
      this._lightingContextEntity = this._runtimeWorld.spawn(
        LightingContext({
          effect: null,
          lightStore: null,
          lights: [],
          wrappedLightFn: null,
          requiredChannels: new Set(),
          materials: new Set<Sprite2DMaterial>(),
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
    this._shadowPipelineEntity = this._runtimeWorld.spawn(
      ShadowPipeline({ onResourcesChanged: this._onShadowPipelineResourcesChanged })
    )
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

  private _assertUsable(member: string): void {
    if (this._disposed) throw new Error(`three-flatland: Flatland.${member} cannot be used after dispose()`)
  }

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
    return (
      (this._runtimeWorld.read(this._lightingContextEntity, LightingContext) as LightingContextData | undefined) ?? null
    )
  }

  /**
   * Get the BatchRegistry data from the world singleton.
   */
  private _getRegistry(): RegistryData | null {
    const registryEntities = this._runtimeWorld.view(BatchRegistries)
    if (registryEntities.length === 0) return null
    return (this._runtimeWorld.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined) ?? null
  }

  /**
   * Render Flatland.
   */
  render(renderer: WebGPURenderer): void {
    // Keep the steady render path to one predictable branch; mutation entry
    // points share the descriptive helper outside the frame-critical path.
    this._assertUsable('render')
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

    // Flatland can share a renderer with a host scene. Capture clear state
    // before the ECS schedule because lighting pre-passes may change it before
    // the main draw starts. The reusable Color keeps this per-frame guard
    // allocation-free.
    renderer.getClearColor(this._savedClearColor)
    const savedClearAlpha = renderer.getClearAlpha()

    // Mark frame start before ANY renderer.render() calls this frame.
    // Flatland runs multiple internal render passes (SDF pass, occlusion
    // pass, main render, post-processing) — `beginFrame` + `endFrame`
    // aggregates them as ONE logical frame so FPS, cpuMs, draw calls and
    // triangles all report the actual user-visible frame stats, not
    // multiplied by pass count.
    this._devtools?.beginFrame(performance.now(), renderer)

    try {
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

        // R3F can assign clear props after construction, so synchronize them at
        // the last possible point. A PassNode forces autoClear while drawing its
        // private scene target, so an active pipeline always needs Flatland's
        // clear color/alpha even when the public autoClear option is false.
        const renderPipeline = this._renderPipeline
        const pipelineActive = renderPipeline !== null && this._renderPipelineEnabled
        const clearRequested = this.autoClear || pipelineActive
        // A Color background forces a Three clear even when autoClear is false,
        // so direct accumulation must leave the scene background unset. A
        // pipeline preserves a user-authored background (for example a
        // texture); Flatland only synchronizes the default background it owns.
        if (!pipelineActive || this.scene.background === this._managedSceneBackground) {
          this._managedSceneBackground = clearRequested && this.clearAlpha >= 1 ? this.clearColor : null
          this.scene.background = this._managedSceneBackground
        }
        const prevAutoClear = renderer.autoClear
        // Preserve the host's compositing choice for the pipeline's final
        // fullscreen output. PassNode independently forces autoClear while it
        // renders the scene into its private input target.
        renderer.autoClear = pipelineActive ? prevAutoClear : this.autoClear
        try {
          if (clearRequested) {
            // Fully transparent pixels use black to avoid RGB bleed during
            // filtering. Fractional alpha preserves the authored clear color.
            renderer.setClearColor(this.clearAlpha === 0 ? 0x000000 : this.clearColor, this.clearAlpha)
          }

          if (pipelineActive) {
            beginDebugPass('main.post', renderer)
            try {
              renderPipeline.render()
            } finally {
              endDebugPass(renderer)
            }
          } else {
            beginDebugPass('main', renderer)
            try {
              renderer.render(this.scene, this._camera)
            } finally {
              endDebugPass(renderer)
            }
          }
        } finally {
          renderer.autoClear = prevAutoClear
        }
      } finally {
        try {
          if (renderTargetChanged && currentRenderTarget !== undefined) {
            renderer.setRenderTarget(currentRenderTarget)
          }
        } finally {
          restorePixelViewport?.()
        }
      }
    } finally {
      try {
        renderer.setClearColor(this._savedClearColor, savedClearAlpha)
      } finally {
        // Mark frame end after ALL renderer.render() calls have completed.
        // This aggregates internal passes into one logical devtools frame and
        // still balances beginFrame if renderer-state restoration throws.
        this._devtools?.endFrame(renderer)
      }
    }
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
      this._installManagedPassSize(scenePass)
      this._renderPipeline = rp
      this._passNode = scenePass
      this._autoRenderPipeline = true
      this._renderPipelineEnabled = true

      // Mark dirty so the system rebuilds
      if (this._postPassRegistryEntity) {
        this._runtimeWorld.patch(this._postPassRegistryEntity, PostPassRegistry, { dirty: true })
      }
    }

    this._syncPassSamplingViewport(renderer)

    this._syncRenderPipelineOutputTransform()

    // Run postPassSystem to get sorted passes (returns null if not dirty)
    const sortedPasses = postPassSystem(this._runtimeWorld)
    if (sortedPasses && this._renderPipeline && this._passNode) {
      // PassNode's target stays full-surface sized, so sample only the active
      // canvas or pixel-camera viewport. Full-surface paths retain (1,1)/(0,0).
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

  /** Keep an auto scene pass and its sampling window on the active output viewport. */
  private _syncPassSamplingViewport(renderer: WebGPURenderer): void {
    if (!this._autoRenderPipeline || !this._passNode) {
      this._resetPassViewportSampling()
      return
    }

    if (this._camera instanceof PixelPerfectCamera) {
      const viewport = this._camera.viewport
      let passWidth: number
      let passHeight: number
      if (this._renderTarget) {
        passWidth = this._renderTarget.width
        passHeight = this._renderTarget.height
      } else {
        renderer.getDrawingBufferSize(this._drawingBufferSize)
        passWidth = this._drawingBufferSize.x
        passHeight = this._drawingBufferSize.y
      }
      if (!this._isValidSize(passWidth, passHeight)) return
      this._passNode.setViewport(viewport)
      this._passViewportUvScale.value.set(viewport.width / passWidth, viewport.height / passHeight)
      this._passViewportUvOffset.value.set(viewport.x / passWidth, viewport.y / passHeight)
      return
    }

    if (!this._renderTarget) {
      const viewport = this._getPhysicalCanvasViewport(renderer)
      renderer.getDrawingBufferSize(this._drawingBufferSize)
      const passWidth = this._drawingBufferSize.x
      const passHeight = this._drawingBufferSize.y
      if (viewport && this._isValidSize(passWidth, passHeight)) {
        const isFullSurface =
          viewport.x === 0 && viewport.y === 0 && viewport.width === passWidth && viewport.height === passHeight
        if (!isFullSurface) {
          this._passNode.setViewport(viewport)
          this._passViewportUvScale.value.set(viewport.width / passWidth, viewport.height / passHeight)
          this._passViewportUvOffset.value.set(viewport.x / passWidth, viewport.y / passHeight)
          return
        }
      }
    }

    // Three r185 explicitly supports `null` to restore automatic sizing; the
    // matching @types/three release omitted that documented overload.
    ;(this._passNode as PassNode & { setViewport(viewport: Vector4 | null): void }).setViewport(null)
    this._resetPassViewportSampling()
  }

  /** Restore full-texture sampling when Flatland does not own an auto crop. */
  private _resetPassViewportSampling(): void {
    this._passViewportUvScale.value.set(1, 1)
    this._passViewportUvOffset.value.set(0, 0)
  }

  /**
   * PassNode normally allocates from the canvas drawing buffer even while the
   * renderer targets an offscreen surface. Keep its public `setSize` contract,
   * but substitute Flatland's destination dimensions. A user-supplied pass is
   * destination-viewport-sized; an auto pass remains full-surface so Flatland's
   * generated output can crop it through `_passViewportUv*`.
   */
  private _installManagedPassSize(passNode: PassNode): void {
    this._restoreManagedPassSize()
    // oxlint-disable-next-line typescript/unbound-method -- restored by identity and invoked with passNode via call().
    const original = passNode.setSize
    const wrapped: PassNode['setSize'] = (width, height) => {
      if (!this._autoRenderPipeline && this._camera instanceof PixelPerfectCamera) {
        original.call(passNode, this._camera.viewport.width, this._camera.viewport.height)
        return
      }
      if (
        !this._autoRenderPipeline &&
        !this._renderTarget &&
        this._isValidSize(this._lastSyncedWidth, this._lastSyncedHeight)
      ) {
        original.call(passNode, this._lastSyncedWidth, this._lastSyncedHeight)
        return
      }
      const target = this._renderTarget
      original.call(passNode, target?.width ?? width, target?.height ?? height)
    }
    this._managedPassNode = passNode
    this._managedPassOriginalSetSize = original
    this._managedPassWrappedSetSize = wrapped
    passNode.setSize = wrapped
  }

  /** Restore a pass before it becomes user-owned or is disposed. */
  private _restoreManagedPassSize(): void {
    if (
      this._managedPassNode &&
      this._managedPassOriginalSetSize &&
      this._managedPassWrappedSetSize &&
      this._managedPassNode.setSize === this._managedPassWrappedSetSize
    ) {
      this._managedPassNode.setSize = this._managedPassOriginalSetSize
    }
    this._managedPassNode = null
    this._managedPassOriginalSetSize = null
    this._managedPassWrappedSetSize = null
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
    this._assertUsable('resize')
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
   * dimensions when rendering to texture, the full drawing buffer for a pixel
   * camera that owns its viewport, or the inherited active canvas viewport for
   * an ordinary camera.
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
    } else if (this._camera instanceof PixelPerfectCamera) {
      renderer.getDrawingBufferSize(this._drawingBufferSize)
      width = this._drawingBufferSize.x
      height = this._drawingBufferSize.y
    } else {
      const viewport = this._getPhysicalCanvasViewport(renderer)
      if (!viewport) return
      width = viewport.width
      height = viewport.height
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

  /** Read Three's logical canvas viewport in the physical pixels used by GPU resources. */
  private _getPhysicalCanvasViewport(renderer: WebGPURenderer): Vector4 | null {
    const pixelRatio = renderer.getPixelRatio()
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return null
    renderer.getViewport(this._activeCanvasViewport)
    this._activeCanvasViewport.multiplyScalar(pixelRatio).floor()
    return this._isValidSize(this._activeCanvasViewport.width, this._activeCanvasViewport.height)
      ? this._activeCanvasViewport
      : null
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
    if (this._disposed) return
    if (this._lightingTransitioning) {
      throw new Error('three-flatland: dispose() cannot run reentrantly during a lighting transition')
    }
    this._lifecycleRevision++
    this._lightingTransitioning = true
    try {
      this._dispose()
    } finally {
      this._lightingTransitioning = false
    }
  }

  private _dispose(): void {
    let firstError: unknown
    let didError = false
    const recordError = (error: unknown): void => {
      if (!didError) {
        firstError = error
        didError = true
      }
    }
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        recordError(error)
      }
    }

    // Publish terminal state before resolving teardown handles. Flatland
    // retains its own reference to the shared world and shadow GPU resources,
    // so a public SpriteGroup disposed before or during this teardown cannot
    // make parent-owned cleanup unreachable or trigger lazy-world access.
    this._disposed = true
    const world = this._sharedWorld
    this._sharedWorld = null
    const shadowEntity = this._shadowPipelineEntity
    this._shadowPipelineEntity = null
    let sdfGenerator = this._shadowSdfGenerator
    let occlusionPass = this._shadowOcclusionPass
    this._shadowSdfGenerator = null
    this._shadowOcclusionPass = null
    const destroyEntity = (entity: Entity): void => {
      if (!world || !world.isAlive(entity)) return
      world.destroy(entity)
    }
    // Atomically transfer the live generation out of the trait before any
    // user callback can run a shadow system during teardown. If reentrant
    // child disposal already dropped the trait, the synchronized parent
    // handles above remain authoritative.
    runCleanup(() => {
      if (!world || !shadowEntity || !world.isAlive(shadowEntity)) return
      const pipeline = world.read(shadowEntity, ShadowPipeline)
      if (!pipeline) return
      sdfGenerator = pipeline.sdfGenerator
      occlusionPass = pipeline.occlusionPass
      pipeline.sdfGenerator = null
      pipeline.occlusionPass = null
      pipeline.onResourcesChanged = null
      pipeline.initialized = false
      pipeline.width = 0
      pipeline.height = 0
    })

    // Tear down debug producers first — releases the scene.onAfterRender
    // hook so subsequent renders during dispose don't try to dispatch.
    const devtools = this._devtools
    this._devtools = null
    if (devtools) runCleanup(() => devtools.dispose())

    // Clear every pass independently. One hostile destroy/detach hook must not
    // retain later effects or prevent the world from reaching terminal state.
    for (const passEffect of this._passes) {
      const entity = getEffectEntity(passEffect)
      if (entity) runCleanup(() => destroyEntity(entity))
      runCleanup(() => passEffect._detach())
    }
    this._passes.length = 0
    this._nextPassOrder = 0
    if (this._postPassRegistryEntity) {
      const registryEntity = this._postPassRegistryEntity
      this._postPassRegistryEntity = null
      runCleanup(() => destroyEntity(registryEntity))
    }

    // Clear lighting
    const lightEffect = this._lightEffect
    this._lightEffect = null
    if (lightEffect) {
      const entity = getEffectEntity(lightEffect)
      runCleanup(() => lightEffect.dispose())
      if (entity) runCleanup(() => destroyEntity(entity))
      runCleanup(() => lightEffect._detach())
    }
    if (this._lightingContextEntity) {
      const contextEntity = this._lightingContextEntity
      this._lightingContextEntity = null
      runCleanup(() => destroyEntity(contextEntity))
    }
    const lightStore = this._lightStore
    this._lightStore = null
    if (lightStore) runCleanup(() => lightStore.dispose())
    // These parent-held references survive reentrant child world disposal.
    // World disposal drops trait storage but does not own the GPU resources.
    const ownedSdfGenerator = sdfGenerator
    const ownedOcclusionPass = occlusionPass
    if (ownedSdfGenerator) runCleanup(() => ownedSdfGenerator.dispose())
    if (ownedOcclusionPass) runCleanup(() => ownedOcclusionPass.dispose())
    if (shadowEntity) {
      runCleanup(() => destroyEntity(shadowEntity))
    }
    this._lights.length = 0
    for (const unsubscribe of this._spriteMaterialSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._spriteDisposeSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._tileMapMaterialSubscriptions.values()) runCleanup(unsubscribe)
    for (const unsubscribe of this._tileMapDisposeSubscriptions.values()) runCleanup(unsubscribe)
    for (const sprite of this._spriteOwnedMaterials.keys()) {
      if (_flatlandSpriteOwners.get(sprite) === this) _flatlandSpriteOwners.delete(sprite)
    }
    for (const tileMap of this._tileMapOwnedMaterials.keys()) {
      if (_flatlandTileMapOwners.get(tileMap) === this) _flatlandTileMapOwners.delete(tileMap)
    }
    this._spriteMaterialSubscriptions.clear()
    this._spriteDisposeSubscriptions.clear()
    this._spriteOwnedMaterials.clear()
    this._tileMapMaterialSubscriptions.clear()
    this._tileMapDisposeSubscriptions.clear()
    this._tileMapOwnedMaterials.clear()
    this._pendingChannelValidation.clear()
    this._lightingSystemsRegistered = false

    runCleanup(() => this.spriteGroup.dispose())

    // The batches no longer reference their materials. Retire every logical
    // owner through the canonical path so pending generated tile materials
    // and textures are drained even when one disposal hook throws.
    for (const material of Array.from(this._spriteMaterialRefCounts.keys())) {
      this._spriteMaterialRefCounts.set(material, 1)
      runCleanup(() => this._releaseSpriteMaterial(material))
    }
    this._spriteMaterialRefCounts.clear()
    this._spriteMaterials.clear()

    // Dispose render pipeline
    const renderPipeline = this._renderPipeline
    runCleanup(() => this._restoreManagedPassSize())
    this._managedPassNode = null
    this._managedPassOriginalSetSize = null
    this._managedPassWrappedSetSize = null
    this._renderPipeline = null
    this._passNode = null
    this._outputNode = null
    this._renderPipelineEnabled = false
    if (renderPipeline) runCleanup(() => renderPipeline.dispose?.())
    this._autoRenderPipeline = false

    if (didError) throw firstError
  }
}
