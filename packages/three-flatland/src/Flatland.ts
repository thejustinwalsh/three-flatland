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
} from 'three'
import { RenderPipeline } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import {
  pass,
  uv as uvNode,
  convertToTexture,
  uniform,
} from 'three/tsl'
import type { World, Entity } from 'koota'
import { SpriteGroup } from './pipeline/SpriteGroup'
import { GlobalUniforms } from './GlobalUniforms'
import type { RenderStats } from './pipeline/types'
import { Sprite2D } from './sprites/Sprite2D'
import type { Sprite2DMaterial, ColorTransformFn } from './materials/Sprite2DMaterial'
import type { MaterialEffect } from './materials/MaterialEffect'
import type Node from 'three/src/nodes/core/Node.js'
import type PassNode from 'three/src/nodes/display/PassNode.js'
import type { WorldProvider } from './ecs/world'
import { PostPassTrait, PostPassRegistry, LightEffectTrait, LightingContext, ShadowPipeline, BatchRegistry } from './ecs/traits'
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
  renderer: WebGPURenderer | null
  camera: OrthographicCamera | null
  scene: Scene | null
  worldSize: Vector2 | null
  worldOffset: Vector2 | null
}

/**
 * Options for creating a Flatland instance.
 */
export interface FlatlandOptions {
  /** Render target (null = render to viewport) */
  renderTarget?: RenderTarget | null
  /** Camera to use (null = use internal orthographic camera) */
  camera?: OrthographicCamera | null
  /** Orthographic view size in pixels (default: 400) */
  viewSize?: number
  /** Clear before render (default: true) */
  autoClear?: boolean
  /** Background color */
  clearColor?: ColorRepresentation
  /** Background alpha (default: 1) */
  clearAlpha?: number
  /** Enable post-processing pipeline (default: false) */
  postProcessing?: boolean
  /** Initial aspect ratio (default: 1, use resize() to update) */
  aspect?: number
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
 *   const { gl } = useThree()
 *
 *   useFrame(() => {
 *     flatlandRef.current?.render(gl)
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
  /** Internal scene containing sprites */
  readonly scene: Scene

  /** Internal sprite group for batching */
  readonly spriteGroup: SpriteGroup

  /** Global uniforms shared across all sprite materials */
  readonly globals: GlobalUniforms = new GlobalUniforms()

  /** Camera for 2D rendering */
  private _camera: OrthographicCamera

  /** Orthographic view size */
  private _viewSize: number

  /** Current aspect ratio */
  private _aspect: number

  /** Whether we own the camera (for disposal) */
  private _ownsCamera: boolean

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

  /** Draw calls captured from renderer.info after last render */
  private _drawCalls = 0

  /** Reusable Vector2 to avoid per-frame allocations */
  private _tempVec2 = new Vector2()

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
    this.scene = new Scene()

    // Create sprite group
    this.spriteGroup = new SpriteGroup()
    this.scene.add(this.spriteGroup)

    // Store view size and aspect
    this._viewSize = options.viewSize ?? 400
    this._aspect = options.aspect ?? 1

    // Create or use provided camera
    if (options.camera) {
      this._camera = options.camera
      this._ownsCamera = false
    } else {
      this._camera = this._createCamera()
      this._ownsCamera = true
    }

    // Render target
    this._renderTarget = options.renderTarget ?? null

    // Clear settings
    this.autoClear = options.autoClear ?? true
    this.clearColor = new Color(options.clearColor ?? 0x000000)
    this.clearAlpha = options.clearAlpha ?? 1

    // Background — set in render() based on clearAlpha (R3F sets props after construction)
    this.scene.background = this.clearColor

    // Render pipeline
    this._renderPipelineEnabled = options.postProcessing ?? false
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
    const halfWidth = (this._viewSize * this._aspect) / 2
    const halfHeight = this._viewSize / 2

    const camera = new OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 1000)
    camera.position.z = 100
    return camera
  }

  /**
   * Update camera frustum based on view size and aspect ratio.
   */
  private _updateCameraFrustum(): void {
    if (!this._ownsCamera) return

    const halfWidth = (this._viewSize * this._aspect) / 2
    const halfHeight = this._viewSize / 2

    this._camera.left = -halfWidth
    this._camera.right = halfWidth
    this._camera.top = halfHeight
    this._camera.bottom = -halfHeight
    this._camera.updateProjectionMatrix()
  }

  /**
   * Get the camera.
   */
  get camera(): OrthographicCamera {
    return this._camera
  }

  /**
   * Set a custom camera.
   */
  set camera(value: OrthographicCamera) {
    this._camera = value
    this._ownsCamera = false
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
    this._viewSize = value
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
    this._renderTarget = value
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
        this._validateLightingChannels(child)
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
   */
  setRenderPipeline(renderPipeline: RenderPipeline, passNode: PassNode): void {
    this._renderPipeline = renderPipeline
    this._passNode = passNode
    this._outputNode = renderPipeline.outputNode
    this._renderPipelineEnabled = true
  }

  /**
   * Clear the render pipeline setup.
   */
  clearRenderPipeline(): void {
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
    const entity = this.world.spawn(
      PostPassTrait({ fn, order: passEffect._order, enabled: passEffect.enabled })
    )

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
    // Detach previous
    if (this._lightEffect) {
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
      const entity = this.world.spawn(
        LightEffectTrait({ fn, enabled: lightEffect.enabled })
      )

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
        renderer: existingCtx?.renderer ?? null,
        camera: existingCtx?.camera ?? null,
        scene: existingCtx?.scene ?? null,
        worldSize: existingCtx?.worldSize ?? null,
        worldOffset: existingCtx?.worldOffset ?? null,
      })

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
          renderer: existingCtx?.renderer ?? null,
          camera: existingCtx?.camera ?? null,
          scene: existingCtx?.scene ?? null,
          worldSize: existingCtx?.worldSize ?? null,
          worldOffset: existingCtx?.worldOffset ?? null,
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
          renderer: null,
          camera: null,
          scene: null,
          worldSize: null,
          worldOffset: null,
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

    // Prepend lighting systems before sprite systems. shadowPipelineSystem
    // runs after lightEffectSystem (so the effect's `update` — which may
    // stage per-frame data the shadow pass consumes — has already run) but
    // before sprite systems render, so the SDF texture is fresh when the
    // main render kicks off.
    registry.schedule
      .prepend(shadowPipelineSystem)
      .prepend(lightMaterialAssignSystem)
      .prepend(lightEffectSystem)
      .prepend(lightSyncSystem)
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
          `Add a MaterialEffect that provides these channels (e.g. AutoNormalProvider for 'normal'), ` +
          `or the channel will fall back to channelDefaults and lighting will look incorrect.`
      )
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
    return this._lightingContextEntity.get(LightingContext) as LightingContextData | undefined ?? null
  }

  /**
   * Get the BatchRegistry data from the world singleton.
   */
  private _getRegistry(): RegistryData | null {
    const registryEntities = this.world.query(BatchRegistry)
    if (registryEntities.length === 0) return null
    return registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined ?? null
  }

  /**
   * Render Flatland.
   */
  render(renderer: WebGPURenderer): void {
    // Auto-sync global uniforms from renderer
    this._syncGlobals(renderer)

    // Update LightingContext runtime fields before systems run
    const lctx = this._getLightingContext()
    if (lctx) {
      lctx.renderer = renderer
      lctx.camera = this._camera
      lctx.scene = this.scene
      // Reuse or create Vector2s for world bounds
      if (!lctx.worldSize) lctx.worldSize = new Vector2()
      if (!lctx.worldOffset) lctx.worldOffset = new Vector2()
    }

    // Sync the Flatland-owned world uniform nodes from the current camera
    // bounds so shader-side shadow / radiance math has live values. Mutation
    // on `.value` is free — no shader rebuild. The uniform references were
    // captured by effect shaders at setLighting time.
    const cam = this._camera
    this._worldSizeUniform.value.set(cam.right - cam.left, cam.top - cam.bottom)
    this._worldOffsetUniform.value.set(cam.left, cam.bottom)

    // Run all systems via the schedule (lighting + sprite phases)
    const registry = this._getRegistry()
    if (registry?.schedule) {
      registry.schedule.nextFrame()
      registry.schedule.run(this.world)
    }

    // Update sprite batches (idempotent — schedule already ran)
    this.spriteGroup.update()

    // Store renderer reference
    if (!this._renderer || this._renderer.deref() !== renderer) {
      this._renderer = new WeakRef(renderer)
    }

    // Auto-initialize or rebuild render pipeline if needed
    this._ensureRenderPipeline(renderer)

    // Save current render target
    const currentRenderTarget = renderer.getRenderTarget()

    // Snapshot draw calls before render so we can compute the delta
    const callsBefore = renderer.info.render.calls

    if (this._renderPipeline && this._renderPipelineEnabled) {
      // Render pipeline handles its own render target
      this._renderPipeline.render()
    } else {
      // Direct rendering
      if (this._renderTarget) {
        renderer.setRenderTarget(this._renderTarget)
      }

      // Sync scene.background based on clearAlpha (R3F sets props after construction)
      this.scene.background = this.clearAlpha < 1 ? null : this.clearColor

      // Configure renderer clear state and let render() handle clearing
      const prevAutoClear = renderer.autoClear
      renderer.autoClear = this.autoClear
      if (this.autoClear) {
        renderer.setClearColor(this.clearAlpha < 1 ? 0x000000 : this.clearColor, this.clearAlpha)
      }
      renderer.render(this.scene, this._camera)
      renderer.autoClear = prevAutoClear

      // Restore render target
      if (this._renderTarget) {
        renderer.setRenderTarget(currentRenderTarget)
      }
    }

    // Capture real draw calls from renderer.info (delta = only our render pass)
    this._drawCalls = renderer.info.render.calls - callsBefore
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
      this._renderPipeline = rp
      this._passNode = scenePass
      this._autoRenderPipeline = true
      this._renderPipelineEnabled = true

      // Mark dirty so the system rebuilds
      if (this._postPassRegistryEntity) {
        this._postPassRegistryEntity.set(PostPassRegistry, { dirty: true })
      }
    }

    // Run postPassSystem to get sorted passes (returns null if not dirty)
    const sortedPasses = postPassSystem(this.world)
    if (sortedPasses && this._renderPipeline && this._passNode) {
      if (sortedPasses.length === 0) {
        // No passes — pass through scene directly
        this._outputNode = this._passNode
      } else {
        // Convert PassNode to TextureNode so passes can .sample() at custom UVs
        const uvCoord = uvNode()
        let node: Node<'vec4'> = convertToTexture(this._passNode)
        for (const passFn of sortedPasses) {
          node = passFn(node, uvCoord)
        }
        this._outputNode = node
      }

      this._renderPipeline.outputNode = this._outputNode
      this._renderPipeline.needsUpdate = true
    }
  }

  /**
   * Resize the rendering area.
   */
  resize(width: number, height: number): void {
    this._aspect = width / height
    this._updateCameraFrustum()

    // Resize render target if needed
    if (this._renderTarget) {
      this._renderTarget.setSize(width, height)
    }

    // Forward resize to LightEffect (Forward+, RadianceCascades, etc.)
    if (this._lightEffect?.enabled) {
      this._lightEffect.resize(width, height)
    }
  }

  /**
   * Get render statistics.
   * Draw calls are derived from Three.js renderer.info, not estimated internally.
   */
  get stats(): RenderStats {
    const s = this.spriteGroup.stats
    s.drawCalls = this._drawCalls
    return s
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
      this._renderPipeline.dispose?.()
      this._renderPipeline = null
    }
    this._autoRenderPipeline = false
  }
}
