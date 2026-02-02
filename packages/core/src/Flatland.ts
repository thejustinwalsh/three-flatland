import {
  Scene,
  OrthographicCamera,
  Color,
  type WebGLRenderTarget,
  Group,
  type Object3D,
  type ColorRepresentation,
  type Texture,
  type PointLight,
  type DirectionalLight,
  type AmbientLight,
  type SpotLight,
  Vector2,
  Vector3,
} from 'three'
import { PostProcessing, type WebGPURenderer } from 'three/webgpu'
import { pass, uv as uvNode, convertToTexture } from 'three/tsl'
import { SpriteGroup } from './pipeline/SpriteGroup'
import { Light2D } from './lights/Light2D'
import { LightingSystem } from './lights/LightingSystem'
import { GlobalUniforms } from './GlobalUniforms'
import type { RenderStats } from './pipeline/types'
import { Sprite2D } from './sprites/Sprite2D'
import type { ColorTransformFn } from './materials/Sprite2DMaterial'

// TSL node types are complex - use generic type for flexibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLNode = any

/**
 * An effect function for the post-processing pipeline.
 * Receives the current scene color node and UV coordinates, returns transformed color.
 *
 * @example
 * ```typescript
 * import { crtComplete, vignette } from '@three-flatland/core'
 *
 * const crtEffect: EffectFn = (input, uv) => crtComplete(input, uv, { curvature: 0.15 })
 * const vignetteEffect: EffectFn = (input, uv) => vignette(input, uv, 0.5)
 *
 * flatland.addEffect(crtEffect)
 * flatland.addEffect(vignetteEffect)
 * ```
 */
export type EffectFn = (input: TSLNode, uv: TSLNode) => TSLNode

/**
 * Options for creating a Flatland instance.
 */
export interface FlatlandOptions {
  /** Render target (null = render to viewport) */
  renderTarget?: WebGLRenderTarget | null
  /** Camera to use (null = use internal orthographic camera) */
  camera?: OrthographicCamera | null
  /** Orthographic view size in pixels (default: 400) */
  viewSize?: number
  /** 3D lights to convert to 2D (opt-in) */
  sceneLights?: Array<PointLight | DirectionalLight | AmbientLight | SpotLight>
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
 * Combines sprite batching, post-processing, render targets, and 2D lighting
 * into a single high-level API.
 *
 * @example
 * ```typescript
 * // Basic usage - render to viewport
 * const flatland = new Flatland({ viewSize: 400 })
 * flatland.add(new Sprite2D({ texture }))
 * flatland.add(new Light2D({ type: 'point', position: [100, 100] }))
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
 * const target = new WebGLRenderTarget(512, 512)
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
 * import { Flatland, Sprite2D, Light2D } from '@three-flatland/react'
 *
 * extend({ Flatland, Sprite2D, Light2D })
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
 *       <light2D type="point" position={[100, 100]} color={0xff6600} />
 *     </flatland>
 *   )
 * }
 * ```
 */
export class Flatland extends Group {
  /** Internal scene containing sprites and lights */
  readonly scene: Scene

  /** Internal sprite group for batching */
  readonly spriteGroup: SpriteGroup

  /** Camera for 2D rendering */
  private _camera: OrthographicCamera

  /** Orthographic view size */
  private _viewSize: number

  /** Current aspect ratio */
  private _aspect: number

  /** Whether we own the camera (for disposal) */
  private _ownsCamera: boolean

  /** Render target (null = viewport) */
  private _renderTarget: WebGLRenderTarget | null = null

  /** Post-processing instance */
  private _postProcessing: PostProcessing | null = null

  /** Pass node for post-processing input */
  private _passNode: TSLNode = null

  /** Output node for post-processing effects */
  private _outputNode: TSLNode = null

  /** Whether post-processing is enabled */
  private _postProcessingEnabled: boolean

  /** Collected Light2D instances */
  private _lights: Light2D[] = []

  /** 3D scene lights (converted to 2D approximations) */
  private _sceneLights: Array<PointLight | DirectionalLight | AmbientLight | SpotLight> = []

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

  /** Fixed-slot lighting system (compile once, update per-frame) */
  readonly lighting: LightingSystem = new LightingSystem()

  /** Global uniforms shared across all sprite materials */
  readonly globals: GlobalUniforms = new GlobalUniforms()

  /** Cached lit color transform (flat lighting, no auto-normals) */
  private _litColorTransform: ColorTransformFn | null = null

  /** Per-texture lit color transforms (auto-normals mode) */
  private _litColorTransformsByTexture: Map<number, ColorTransformFn> = new Map()

  /** Sprites with lit: true that need auto-lighting setup */
  private _pendingLitSprites: Set<Sprite2D> = new Set()

  /** Synthetic Light2D instances created from 3D scene lights */
  private _sceneLightProxies: Light2D[] = []

  /** Effect chain for auto-managed post-processing */
  private _effects: EffectFn[] = []

  /** Whether auto post-processing needs rebuilding */
  private _effectsDirty = false

  /** Whether post-processing was auto-initialized (vs. manual setPostProcessing) */
  private _autoPostProcessing = false

  /** Draw calls captured from renderer.info after last render */
  private _drawCalls = 0

  constructor(options: FlatlandOptions = {}) {
    super()

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

    // Background
    this.scene.background = this.clearColor

    // Post-processing
    this._postProcessingEnabled = options.postProcessing ?? false

    // 3D lights
    this._sceneLights = options.sceneLights ?? []
  }

  /**
   * Create internal orthographic camera.
   */
  private _createCamera(): OrthographicCamera {
    const halfWidth = (this._viewSize * this._aspect) / 2
    const halfHeight = this._viewSize / 2

    const camera = new OrthographicCamera(
      -halfWidth,
      halfWidth,
      halfHeight,
      -halfHeight,
      0.1,
      1000
    )
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
    if (this._ownsCamera && this._camera !== value) {
      // Dispose old camera if we owned it
    }
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
  get renderTarget(): WebGLRenderTarget | null {
    return this._renderTarget
  }

  /**
   * Set the render target.
   */
  set renderTarget(value: WebGLRenderTarget | null) {
    this._renderTarget = value
  }

  /**
   * Get the render target texture (or null if rendering to viewport).
   */
  get texture(): Texture | null {
    return this._renderTarget?.texture ?? null
  }

  /**
   * Get the post-processing instance.
   */
  get postProcessing(): PostProcessing | null {
    return this._postProcessing
  }

  /**
   * Get the pass node for composing effects.
   */
  get passNode(): TSLNode {
    return this._passNode
  }

  /**
   * Get/set the output node for post-processing effects.
   * Set this to apply TSL effect chains.
   */
  get outputNode(): TSLNode {
    return this._outputNode
  }

  set outputNode(value: TSLNode) {
    this._outputNode = value
    if (this._postProcessing && value) {
      this._postProcessing.outputNode = value
    }
  }

  /**
   * Get collected Light2D instances.
   */
  get lights(): readonly Light2D[] {
    return this._lights
  }

  /**
   * Get/set 3D scene lights (converted to 2D approximations).
   */
  get sceneLights(): Array<PointLight | DirectionalLight | AmbientLight | SpotLight> {
    return this._sceneLights
  }

  set sceneLights(value: Array<PointLight | DirectionalLight | AmbientLight | SpotLight>) {
    this._sceneLights = value
  }

  /**
   * Create a ColorTransformFn that applies lighting from the fixed-slot LightingSystem.
   * The returned function compiles once into a shader with a loop over 0-8 lights.
   * Adding/removing lights never triggers shader recompilation.
   *
   * @returns ColorTransformFn for use with Sprite2DMaterial
   *
   * @example
   * ```typescript
   * const litMaterial = new Sprite2DMaterial({
   *   map: spriteSheet.texture,
   *   colorTransform: flatland.createLitColorTransform(),
   * })
   * ```
   */
  createLitColorTransform(): ColorTransformFn {
    return this.lighting.createColorTransform()
  }

  /**
   * Add objects to Flatland.
   * Sprites are routed to the internal SpriteGroup for batching.
   * Lights are collected and added to the internal scene.
   * Other objects are added directly to the internal scene.
   *
   * This overrides Group.add() to route children to the internal scene
   * rather than this Group, enabling proper rendering with Flatland's camera.
   */
  add(...objects: Object3D[]): this {
    for (const child of objects) {
      if (child instanceof Light2D) {
        this._lights.push(child)
        this.scene.add(child)
      } else if (child instanceof Sprite2D) {
        // Wire global uniforms to the material (shared by reference)
        if (!child.material.globalUniforms) {
          child.material.globalUniforms = this.globals
        }
        this.spriteGroup.add(child)
        // If sprite has lit: true and no colorTransform, queue for auto-setup
        if (child.material.lit && !child.material.colorTransform) {
          this._pendingLitSprites.add(child)
        }
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
      if (child instanceof Light2D) {
        const idx = this._lights.indexOf(child)
        if (idx !== -1) {
          this._lights.splice(idx, 1)
        }
        this.scene.remove(child)
      } else if (child instanceof Sprite2D) {
        this.spriteGroup.remove(child)
        this._pendingLitSprites.delete(child)
      } else {
        this.scene.remove(child)
      }
    }
    return this
  }

  /**
   * Remove all sprites, lights, and other objects from the internal scene.
   * Overrides Group.clear() to clear the internal scene.
   */
  clear(): this {
    this.spriteGroup.clear()
    for (const light of this._lights) {
      this.scene.remove(light)
    }
    this._lights = []

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
   * Initialize post-processing with a given PostProcessing instance.
   * Users should create the PostProcessing and pass node themselves for flexibility.
   *
   * @example
   * ```typescript
   * import { PostProcessing, pass } from 'three/webgpu'
   * import { crtComplete } from '@three-flatland/core'
   *
   * const postProcessing = new PostProcessing(renderer)
   * const scenePass = pass(flatland.scene, flatland.camera)
   * postProcessing.outputNode = crtComplete(scenePass, uv(), { curvature: 0.1 })
   *
   * flatland.setPostProcessing(postProcessing, scenePass)
   * ```
   */
  setPostProcessing(postProcessing: PostProcessing, passNode: TSLNode): void {
    this._postProcessing = postProcessing
    this._passNode = passNode
    this._outputNode = postProcessing.outputNode
    this._postProcessingEnabled = true
  }

  /**
   * Clear the post-processing setup.
   */
  clearPostProcessing(): void {
    this._postProcessing = null
    this._passNode = null
    this._outputNode = null
    this._postProcessingEnabled = false
    this._autoPostProcessing = false
  }

  /**
   * Add an effect to the post-processing chain.
   * Effects are applied in order. Automatically enables post-processing.
   *
   * @param effect - Effect function that transforms scene color
   * @returns this (for chaining)
   *
   * @example
   * ```typescript
   * import { crtComplete, vignette } from '@three-flatland/core'
   *
   * flatland
   *   .addEffect((input, uv) => crtComplete(input, uv, { curvature: 0.15 }))
   *   .addEffect((input, uv) => vignette(input, uv, 0.5))
   * ```
   */
  addEffect(effect: EffectFn): this {
    this._effects.push(effect)
    this._effectsDirty = true
    this._postProcessingEnabled = true
    return this
  }

  /**
   * Remove an effect from the post-processing chain.
   *
   * @param effect - The same function reference passed to addEffect()
   * @returns this (for chaining)
   */
  removeEffect(effect: EffectFn): this {
    const idx = this._effects.indexOf(effect)
    if (idx !== -1) {
      this._effects.splice(idx, 1)
      this._effectsDirty = true
    }
    return this
  }

  /**
   * Remove all effects from the post-processing chain.
   * Disables post-processing if it was auto-initialized.
   *
   * @returns this (for chaining)
   */
  clearEffects(): this {
    this._effects.length = 0
    this._effectsDirty = true
    if (this._autoPostProcessing) {
      this._postProcessingEnabled = false
    }
    return this
  }

  /**
   * Get the current effect chain.
   */
  get effects(): readonly EffectFn[] {
    return this._effects
  }

  /**
   * Render Flatland.
   */
  render(renderer: WebGPURenderer): void {
    // Auto-sync global uniforms from renderer
    this._syncGlobals(renderer)

    // Process pending lit sprites (deferred auto-lighting)
    this._processPendingLitSprites()

    // Convert 3D lights to 2D proxies (before sync so they're included)
    this._update3DLights()

    // Sync light uniforms (position, color, intensity, etc.)
    this._syncLightUniforms()

    // Update sprite batches
    this.spriteGroup.update()

    // Store renderer reference
    if (!this._renderer || this._renderer.deref() !== renderer) {
      this._renderer = new WeakRef(renderer)
    }

    // Auto-initialize or rebuild post-processing if needed
    this._ensurePostProcessing(renderer)

    // Save current render target
    const currentRenderTarget = renderer.getRenderTarget()

    // Snapshot draw calls before render so we can compute the delta
    const callsBefore = renderer.info.render.calls

    if (this._postProcessing && this._postProcessingEnabled) {
      // Post-processing handles its own render target
      this._postProcessing.render()
    } else {
      // Direct rendering
      if (this._renderTarget) {
        renderer.setRenderTarget(this._renderTarget)
      }

      if (this.autoClear) {
        renderer.setClearColor(this.clearColor, this.clearAlpha)
        renderer.clear()
      }

      renderer.render(this.scene, this._camera)

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
      const delta = (now - this._lastRenderTime) / 1000 // ms → seconds
      this.globals.updateTime(delta)
    }
    this._lastRenderTime = now

    // Viewport size from renderer
    const size = renderer.getSize(new Vector2())
    this.globals.viewportSize = size

    // Pixel ratio from renderer
    this.globals.pixelRatio = renderer.getPixelRatio()
  }

  /**
   * Sync all Light2D properties into the LightingSystem's uniform arrays.
   * Includes both user Light2D instances and synthetic proxies from 3D lights.
   * Called once per frame — no shader recompilation.
   */
  private _syncLightUniforms(): void {
    if (this._sceneLightProxies.length === 0) {
      this.lighting.sync(this._lights)
    } else {
      // Combine user lights + 3D light proxies
      const allLights = this._lights.concat(this._sceneLightProxies)
      this.lighting.sync(allLights)
    }
  }

  /**
   * Process sprites that have lit: true but no colorTransform yet.
   * When autoNormals is off: shared flat lighting transform for all sprites.
   * When autoNormals is on: per-texture transforms (normals sample the texture).
   */
  private _processPendingLitSprites(): void {
    if (this._pendingLitSprites.size === 0) return

    if (!this.lighting.autoNormals) {
      // Flat lighting — one shared transform for all sprites
      if (!this._litColorTransform) {
        this._litColorTransform = this.createLitColorTransform()
      }
      for (const sprite of this._pendingLitSprites) {
        sprite.material.colorTransform = this._litColorTransform
      }
    } else {
      // Auto-normals — group by texture, one transform per unique texture
      for (const sprite of this._pendingLitSprites) {
        const tex = sprite.material.getTexture()
        if (!tex) {
          // No texture yet — use flat lighting fallback
          if (!this._litColorTransform) {
            this._litColorTransform = this.createLitColorTransform()
          }
          sprite.material.colorTransform = this._litColorTransform
          continue
        }

        let transform = this._litColorTransformsByTexture.get(tex.id)
        if (!transform) {
          transform = this.lighting.createColorTransform({
            texture: tex,
            autoNormals: true,
            rimEnabled: this.lighting.rimEnabled,
          })
          this._litColorTransformsByTexture.set(tex.id, transform)
        }
        sprite.material.colorTransform = transform
      }
    }

    this._pendingLitSprites.clear()
  }

  /**
   * Update 2D light proxies from 3D scene lights.
   * Converts Three.js PointLight, DirectionalLight, SpotLight, AmbientLight
   * into Light2D proxies by projecting onto the XY plane.
   *
   * Proxies are re-used across frames to avoid allocations.
   */
  private _update3DLights(): void {
    if (this._sceneLights.length === 0) {
      this._sceneLightProxies.length = 0
      return
    }

    // Grow or shrink the proxy array to match scene lights
    while (this._sceneLightProxies.length < this._sceneLights.length) {
      this._sceneLightProxies.push(new Light2D())
    }
    this._sceneLightProxies.length = this._sceneLights.length

    for (let i = 0; i < this._sceneLights.length; i++) {
      const light3D = this._sceneLights[i]!
      const converted = convertLight3DTo2D(light3D)
      const proxy = this._sceneLightProxies[i]!

      proxy.lightType = converted.type
      proxy.color = converted.color
      proxy.intensity = converted.intensity
      proxy.enabled = light3D.visible !== false

      if (converted.position) {
        proxy.position.set(converted.position.x, converted.position.y, 0)
      }
      if (converted.direction) {
        proxy.direction = converted.direction
      }
      if (converted.radius !== undefined) {
        proxy.radius = converted.radius
      }
      if (converted.angle !== undefined) {
        proxy.angle = converted.angle
      }
    }
  }

  /**
   * Auto-initialize post-processing on first render if enabled,
   * and rebuild the effect chain when effects are added/removed.
   */
  private _ensurePostProcessing(renderer: WebGPURenderer): void {
    // Nothing to do if post-processing disabled and no effects
    if (!this._postProcessingEnabled && this._effects.length === 0) return

    // Auto-initialize PostProcessing if we have effects but no instance yet
    if (!this._postProcessing && this._effects.length > 0) {
      const pp = new PostProcessing(renderer)
      const scenePass = pass(this.scene, this._camera)
      this._postProcessing = pp
      this._passNode = scenePass
      this._autoPostProcessing = true
      this._postProcessingEnabled = true
      this._effectsDirty = true // Force rebuild on init
    }

    // Rebuild effect chain if dirty
    if (this._effectsDirty && this._postProcessing && this._passNode) {
      this._effectsDirty = false

      if (this._effects.length === 0) {
        // No effects — pass through scene directly
        this._outputNode = this._passNode
      } else {
        // Convert PassNode to TextureNode so effects can .sample() at custom UVs
        const uvCoord = uvNode()
        let node = convertToTexture(this._passNode) as TSLNode
        for (const effect of this._effects) {
          node = effect(node, uvCoord)
        }
        this._outputNode = node
      }

      this._postProcessing.outputNode = this._outputNode
      this._postProcessing.needsUpdate = true
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
   * Dispose of all resources.
   */
  dispose(): void {
    this.spriteGroup.dispose()

    if (this._ownsCamera) {
      // OrthographicCamera doesn't have dispose method
    }

    // Clear lights
    for (const light of this._lights) {
      light.dispose?.()
    }
    this._lights = []
    this._sceneLightProxies = []
    this._sceneLights = []

    // Dispose post-processing
    if (this._postProcessing) {
      this._postProcessing.dispose?.()
      this._postProcessing = null
    }
    this._effects.length = 0
    this._effectsDirty = false
    this._autoPostProcessing = false
  }
}

/**
 * Convert 3D light position to 2D by projecting onto XY plane.
 */
export function convertLight3DTo2D(
  light: PointLight | DirectionalLight | AmbientLight | SpotLight
): {
  type: 'point' | 'directional' | 'ambient' | 'spot'
  position?: Vector2
  direction?: Vector2
  color: Color
  intensity: number
  radius?: number
  angle?: number
} {
  if ('isAmbientLight' in light && light.isAmbientLight) {
    return {
      type: 'ambient',
      color: light.color.clone(),
      intensity: light.intensity,
    }
  }

  if ('isPointLight' in light && light.isPointLight) {
    return {
      type: 'point',
      position: new Vector2(light.position.x, light.position.y),
      color: light.color.clone(),
      intensity: light.intensity,
      radius: light.distance || 500,
    }
  }

  if ('isDirectionalLight' in light && light.isDirectionalLight) {
    const dir = new Vector3(0, 0, -1).applyQuaternion(light.quaternion)
    return {
      type: 'directional',
      direction: new Vector2(dir.x, dir.y).normalize(),
      color: light.color.clone(),
      intensity: light.intensity,
    }
  }

  if ('isSpotLight' in light && light.isSpotLight) {
    const dir = new Vector3(0, 0, -1).applyQuaternion(light.quaternion)
    return {
      type: 'spot',
      position: new Vector2(light.position.x, light.position.y),
      direction: new Vector2(dir.x, dir.y).normalize(),
      color: light.color.clone(),
      intensity: light.intensity,
      radius: light.distance || 500,
      angle: light.angle,
    }
  }

  // Default fallback
  return {
    type: 'ambient',
    color: new Color(0xffffff),
    intensity: 1,
  }
}
