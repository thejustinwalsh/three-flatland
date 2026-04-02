import { MeshBasicNodeMaterial } from 'three/webgpu'
import { attribute, vec2, vec3, vec4, float, Fn, mix, floor, mod, positionWorld } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { Texture } from 'three'
import type { InstanceAttributeConfig, InstanceAttributeType } from '../pipeline/types'
import type { MaterialEffect, EffectSchemaValue, SchemaToNodeType, ChannelNodeContext } from './MaterialEffect'
import { channelDefaults } from './channels'

/**
 * System flags (lit, receiveShadows) occupy the lowest bits of the effect flags bitmask.
 * MaterialEffect enable bits start at this offset to avoid collision.
 * Must match EFFECT_BIT_OFFSET in Sprite2D.ts.
 */
const EFFECT_BIT_OFFSET = 2

// ============================================
// Color Transform Types
// ============================================

/**
 * Context passed to colorTransform callbacks.
 */
export interface ColorTransformContext {
  /** Base sampled + tinted color (vec4) */
  color: Node<'vec4'>
  /** UV after flip + atlas remap */
  atlasUV: Node<'vec2'>
  /** World position XY (works with instancing via positionWorld) */
  worldPosition: Node<'vec2'>
}

/**
 * A function that transforms the base sprite color.
 * Receives the base color and context, returns modified color (vec4).
 */
export type ColorTransformFn = (ctx: ColorTransformContext) => Node<'vec4'>

/**
 * Compute the buffer tier for a given float count.
 * Tiers: 0, 4, 8, 16, and multiples of 4 beyond 16.
 */
export function computeTier(neededFloats: number): number {
  if (neededFloats <= 0) return 0
  if (neededFloats <= 4) return 4
  if (neededFloats <= 8) return 8
  if (neededFloats <= 16) return 16
  return Math.ceil(neededFloats / 4) * 4
}

/**
 * Get a TSL component accessor from a packed vec4 buffer array.
 * Maps an absolute float offset to the correct bufNode[n].xyzw component.
 */
export function getPackedComponent(bufNodes: Node<'vec4'>[], absoluteOffset: number): Node<'float'> {
  const bufIdx = Math.floor(absoluteOffset / 4)
  const comp = absoluteOffset % 4
  const node = bufNodes[bufIdx]!
  const components = [node.x, node.y, node.z, node.w] as const
  return components[comp]!
}

/** Options for EffectMaterial constructor. */
export interface EffectMaterialOptions {
  /**
   * Effect buffer tier size in floats.
   * Buffers are allocated in tiers: 0, 4, 8, 16.
   * Default is 8 (2 vec4 buffers), covering most effect combinations.
   * Set to 0 for fully effect-free materials (no effect buffer overhead).
   */
  effectTier?: number
}

/**
 * Get the number of floats for an attribute type.
 */
function getTypeSize(type: InstanceAttributeType): number {
  switch (type) {
    case 'float':
      return 1
    case 'vec2':
      return 2
    case 'vec3':
      return 3
    case 'vec4':
      return 4
  }
}

/**
 * Base material class with composable packed-buffer effect system.
 *
 * Extends MeshBasicNodeMaterial and adds:
 * - Packed vec4 effect buffers with bitmask enable flags
 * - Effect registration with automatic slot assignment
 * - Shader rebuilding with effect chain composition
 *
 * Subclasses override `_buildBaseColor()` to provide their own base color/UV
 * (e.g., Sprite2DMaterial provides sprite-specific UV flip, atlas, tint).
 *
 * This base class can be extended for non-sprite materials that also need effects.
 */
export class EffectMaterial extends MeshBasicNodeMaterial {
  /**
   * Instance attribute schema for SpriteBatch to read.
   * Contains effectBuf0, effectBuf1, ... for packed effect data.
   * @internal
   */
  _instanceAttributes: Map<string, InstanceAttributeConfig> = new Map()

  /**
   * Registered effect classes on this material.
   * @internal
   */
  _effects: (typeof MaterialEffect)[] = []

  /**
   * Stored constants per effect (keyed by effect name).
   * Used by _rebuildColorNode to pass constants to channelNode and _node.
   * @internal
   */
  _effectConstants: Map<string, Record<string, unknown>> = new Map()

  // ============================================
  // PACKED EFFECT BUFFER STATE
  // ============================================

  /**
   * Maps `effectName_fieldName` to its packed buffer offset and size.
   * Offsets are absolute (slot 0 = flags, slot 1+ = data).
   * @internal
   */
  _effectSlots: Map<string, { offset: number; size: number }> = new Map()

  /**
   * Maps effect name to its bit position in the enable flags bitmask.
   * @internal
   */
  _effectBitIndex: Map<string, number> = new Map()

  /**
   * Total floats needed across all registered effects (1 flags + data floats).
   * 0 when no effects are registered.
   * @internal
   */
  _effectTotalFloats: number = 0

  /**
   * Current buffer tier (0, 4, 8, 16, ...).
   * Determines the actual buffer allocation size.
   * @internal
   */
  _effectTier: number

  /**
   * Configured default tier (constructor option).
   * When effects are registered, the tier is at least this value.
   * @internal
   */
  _defaultEffectTier: number

  /**
   * Version counter for effect schema changes (tier upgrades).
   * Incremented when the tier changes, used by SpriteGroup to detect
   * when batches need rebuilding.
   * @internal
   */
  _effectSchemaVersion: number = 0

  /**
   * Color transform function (e.g., lighting).
   * @internal
   */
  protected _colorTransform: ColorTransformFn | null = null

  /**
   * Set of per-fragment channel names required by the active colorTransform.
   * @internal
   */
  protected _requiredChannels: ReadonlySet<string> = new Set()

  constructor(options: EffectMaterialOptions = {}) {
    super()

    // Set up effect tier
    this._defaultEffectTier = options.effectTier ?? 8
    this._effectTier = this._defaultEffectTier

    // Allocate effect buffer attributes for the initial tier
    this._rebuildEffectBufferAttributes()
  }

  /**
   * Get the color transform function.
   */
  get colorTransform(): ColorTransformFn | null {
    return this._colorTransform
  }

  /**
   * Set the color transform function.
   * Triggers shader rebuild.
   */
  set colorTransform(value: ColorTransformFn | null) {
    if (this._colorTransform === value) return
    this._colorTransform = value
    if (this._canBuildColor()) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Get the required channels set.
   */
  get requiredChannels(): ReadonlySet<string> {
    return this._requiredChannels
  }

  /**
   * Set the required channels.
   * Triggers shader rebuild when channels change.
   */
  set requiredChannels(value: ReadonlySet<string>) {
    if (this._requiredChannels === value) return
    this._requiredChannels = value
    if (this._canBuildColor()) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  // ============================================
  // EFFECT SYSTEM
  // ============================================

  /**
   * Register an effect class on this material.
   * Assigns a bit index and packed buffer slots, then rebuilds the shader.
   * If the effect is already registered, this is a no-op.
   *
   * @param effectClass - The MaterialEffect subclass to register
   * @param constants - Optional constants from the effect instance (for provider effects)
   * @returns Whether the buffer tier changed (requiring batch rebuild).
   */
  registerEffect(effectClass: typeof MaterialEffect, constants?: Record<string, unknown>): boolean {
    // Ensure static initialization
    effectClass._initialize()

    // Skip if already registered
    if (this._effectBitIndex.has(effectClass.effectName)) return false

    // Store constants if provided
    if (constants && Object.keys(constants).length > 0) {
      this._effectConstants.set(effectClass.effectName, constants)
    }

    // 1. Push effect class and assign bit index (offset past system flag bits)
    this._effects.push(effectClass)
    const bitIndex = this._effects.length - 1 + EFFECT_BIT_OFFSET
    this._effectBitIndex.set(effectClass.effectName, bitIndex)

    // 2. Assign sequential float offsets for each field (after flags at slot 0)
    let nextOffset = 1 // Start after the flags float
    for (const existingEffect of this._effects) {
      for (const field of existingEffect._fields) {
        const key = `${existingEffect.effectName}_${field.name}`
        if (!this._effectSlots.has(key)) {
          this._effectSlots.set(key, { offset: nextOffset, size: field.size })
          nextOffset += field.size
        } else {
          nextOffset = this._effectSlots.get(key)!.offset + this._effectSlots.get(key)!.size
        }
      }
    }

    // 3. Compute new total: 1 (flags) + sum of all effect data floats
    let dataFloats = 0
    for (const eff of this._effects) {
      dataFloats += eff._totalFloats
    }
    this._effectTotalFloats = 1 + dataFloats

    // 4. Compute new tier
    const oldTier = this._effectTier
    const neededTier = computeTier(this._effectTotalFloats)
    this._effectTier = Math.max(neededTier, this._defaultEffectTier)

    const tierChanged = this._effectTier !== oldTier

    // 5. If tier changed, rebuild effect buffer attributes
    if (tierChanged) {
      this._rebuildEffectBufferAttributes()
      this._effectSchemaVersion++
    }

    // 6. Rebuild colorNode with new effect chain
    this._rebuildColorNode()
    this.needsUpdate = true

    return tierChanged
  }

  /**
   * Check if an effect class is registered on this material.
   */
  hasEffect(effectClass: typeof MaterialEffect): boolean {
    return this._effectBitIndex.has(effectClass.effectName)
  }

  /**
   * Get the list of registered effect classes.
   */
  getEffects(): readonly (typeof MaterialEffect)[] {
    return this._effects
  }

  /**
   * Rebuild effect buffer attributes in `_instanceAttributes` for the current tier.
   * @internal
   */
  _rebuildEffectBufferAttributes(): void {
    // Remove old effect buffer attributes
    for (const name of [...this._instanceAttributes.keys()]) {
      if (name.startsWith('effectBuf')) {
        this._instanceAttributes.delete(name)
      }
    }

    // Add new effect buffer attributes for the current tier
    const numVec4s = this._effectTier / 4
    for (let i = 0; i < numVec4s; i++) {
      this._instanceAttributes.set(`effectBuf${i}`, {
        name: `effectBuf${i}`,
        type: 'vec4',
        defaultValue: [0, 0, 0, 0],
      })
    }
  }

  /**
   * Hook for subclasses to provide base color and UV nodes.
   * Returns `{ color, uv }` — the base color node and UV node that effects can read.
   * Default returns null (no base color — effects cannot be applied).
   * @internal
   */
  protected _buildBaseColor(): { color: Node<'vec4'>; uv: Node<'vec2'> } | null {
    return null
  }

  /**
   * Check if _buildBaseColor has prerequisites (e.g. texture set).
   * Subclasses override this to gate _rebuildColorNode() calls.
   * @internal
   */
  protected _canBuildColor(): boolean {
    return true
  }

  /**
   * Get the base texture for channel providers (e.g., auto-normal from diffuse alpha).
   * Returns null by default. Sprite2DMaterial overrides to return the sprite texture.
   * @internal
   */
  protected _getBaseTexture(): Texture | null {
    return null
  }

  /**
   * Build TSL attribute nodes for an effect from packed buffer data.
   * @internal
   */
  protected _buildEffectAttrs(
    effectClass: typeof MaterialEffect,
    bufNodes: Node<'vec4'>[]
  ): Record<string, SchemaToNodeType<EffectSchemaValue>> {
    const attrs: Record<string, SchemaToNodeType<EffectSchemaValue>> = {}
    for (const field of effectClass._fields) {
      const slotKey = `${effectClass.effectName}_${field.name}`
      const slotInfo = this._effectSlots.get(slotKey)!
      if (field.size === 1) {
        attrs[field.name] = getPackedComponent(bufNodes, slotInfo.offset)
      } else if (field.size === 2) {
        attrs[field.name] = vec2(
          getPackedComponent(bufNodes, slotInfo.offset),
          getPackedComponent(bufNodes, slotInfo.offset + 1)
        )
      } else if (field.size === 3) {
        attrs[field.name] = vec3(
          getPackedComponent(bufNodes, slotInfo.offset),
          getPackedComponent(bufNodes, slotInfo.offset + 1),
          getPackedComponent(bufNodes, slotInfo.offset + 2)
        )
      } else {
        attrs[field.name] = vec4(
          getPackedComponent(bufNodes, slotInfo.offset),
          getPackedComponent(bufNodes, slotInfo.offset + 1),
          getPackedComponent(bufNodes, slotInfo.offset + 2),
          getPackedComponent(bufNodes, slotInfo.offset + 3)
        )
      }
    }
    return attrs
  }

  /**
   * Rebuild the colorNode from scratch using the 4-phase pipeline:
   *
   * Phase 0: Base color via _buildBaseColor() (no lighting)
   * Phase 1: Resolve channels from provider effects
   * Phase 2: Apply colorTransform (lighting) — only if all required channels resolved
   * Phase 3: Chain color-transforming MaterialEffects (non-providers)
   *
   * Called when texture is set, effects are registered, or colorTransform/channels change.
   * @internal
   */
  _rebuildColorNode(): void {
    if (!this._canBuildColor()) return

    // Bind methods for use inside Fn closure (avoids no-this-alias)
    const buildBaseColor = this._buildBaseColor.bind(this)
    const colorTransformFn = this._colorTransform
    const requiredChannels = this._requiredChannels
    const baseTexture = this._getBaseTexture()

    // Pre-build packed buffer TSL nodes for effects (can be outside Fn)
    const numVec4s = this._effectTier / 4
    const bufNodes: Node<'vec4'>[] = []
    for (let i = 0; i < numVec4s; i++) {
      bufNodes.push(attribute<'vec4'>(`effectBuf${i}`, 'vec4'))
    }

    // Pre-build per-effect data: bit index, attrs, constants
    const effectData: Array<{
      effectClass: typeof MaterialEffect
      bitIndex: number
      attrs: Record<string, SchemaToNodeType<EffectSchemaValue>>
      constants: Record<string, unknown>
      isProvider: boolean
    }> = []

    for (const effectClass of this._effects) {
      const bitIndex = this._effectBitIndex.get(effectClass.effectName)!
      const attrs = this._buildEffectAttrs(effectClass, bufNodes)
      const constants = this._effectConstants.get(effectClass.effectName) ?? {}
      const isProvider = effectClass.provides.length > 0

      effectData.push({ effectClass, bitIndex, attrs, constants, isProvider })
    }

    // Build color node: 4-phase pipeline (all inside Fn for TSL context)
    this.colorNode = Fn(() => {
      // ─── Phase 0: Base color ──────────────────────────────────────────
      const baseResult = buildBaseColor()
      if (!baseResult) return vec4(0, 0, 0, 0)

      let color: Node<'vec4'> = baseResult.color
      const atlasUV = baseResult.uv

      // ─── Phase 1: Resolve channels from provider effects ─────────────
      const resolvedChannels: Record<string, Node> = {}

      if (requiredChannels.size > 0) {
        for (const { effectClass, attrs, constants, isProvider } of effectData) {
          if (!isProvider) continue
          for (const ch of effectClass.provides) {
            if (!requiredChannels.has(ch)) continue
            if (resolvedChannels[ch]) continue // first provider wins
            if (effectClass.channelNode) {
              resolvedChannels[ch] = effectClass.channelNode(ch, {
                atlasUV,
                constants,
                attrs,
                baseTexture,
              } as ChannelNodeContext)
            }
          }
        }
        // Fill any remaining required channels from channelDefaults
        for (const ch of requiredChannels) {
          if (!resolvedChannels[ch] && channelDefaults[ch]) {
            resolvedChannels[ch] = channelDefaults[ch]()
          }
        }
      }

      // ─── Phase 2: Apply colorTransform (lighting) ────────────────────
      if (colorTransformFn) {
        const ctx = {
          color,
          atlasUV,
          worldPosition: positionWorld.xy,
          ...resolvedChannels,
        } as ColorTransformContext
        color = colorTransformFn(ctx)
      }

      // ─── Phase 3: Chain color-transforming MaterialEffects ───────────
      if (effectData.length > 0) {
        const flags = getPackedComponent(bufNodes, 0)

        for (const { effectClass, bitIndex, attrs, constants, isProvider } of effectData) {
          // Skip provider-only effects (they only produce channel data)
          if (isProvider) continue

          // Extract enable bit: floor(mod(flags / 2^bitIndex, 2))
          const divisor = float(1 << bitIndex)
          const shifted = floor(flags.div(divisor))
          const enabled = mod(shifted, float(2.0))

          const effectResult = effectClass._node({
            inputColor: color,
            inputUV: atlasUV,
            attrs,
            constants,
          })

          // Branchless: mix(original, effectResult, enabled)
          color = mix(color, effectResult, enabled)
        }
      }

      return color
    })() as typeof this.colorNode
  }

  // ============================================
  // INSTANCE ATTRIBUTE SCHEMA (read by SpriteBatch)
  // ============================================

  /**
   * Check if an instance attribute exists.
   * @internal
   */
  hasInstanceAttribute(name: string): boolean {
    return this._instanceAttributes.has(name)
  }

  /**
   * Get an instance attribute configuration.
   * @internal
   */
  getInstanceAttribute(name: string): InstanceAttributeConfig | undefined {
    return this._instanceAttributes.get(name)
  }

  /**
   * Get all instance attribute configurations.
   * Used by SpriteBatch to create InstancedBufferAttributes.
   * @internal
   */
  getInstanceAttributeSchema(): Map<string, InstanceAttributeConfig> {
    return this._instanceAttributes
  }

  /**
   * Get the number of floats needed per instance for custom attributes.
   * @internal
   */
  getInstanceAttributeStride(): number {
    let stride = 0
    for (const config of this._instanceAttributes.values()) {
      stride += getTypeSize(config.type)
    }
    return stride
  }
}
