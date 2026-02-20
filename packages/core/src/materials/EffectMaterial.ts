import { MeshBasicNodeMaterial } from 'three/webgpu'
import { attribute, vec2, vec3, vec4, float, Fn, select, mix, floor, mod } from 'three/tsl'
import type { InstanceAttributeConfig, InstanceAttributeType } from '../pipeline/types'
import type { MaterialEffect } from './MaterialEffect'
import type { TSLNode } from '../nodes/types'

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
export function getPackedComponent(bufNodes: TSLNode[], absoluteOffset: number): TSLNode {
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
   * Incremented when the tier changes, used by BatchManager to detect
   * when batches need rebuilding.
   * @internal
   */
  _effectSchemaVersion: number = 0

  constructor(options: EffectMaterialOptions = {}) {
    super()

    // Set up effect tier
    this._defaultEffectTier = options.effectTier ?? 8
    this._effectTier = this._defaultEffectTier

    // Allocate effect buffer attributes for the initial tier
    this._rebuildEffectBufferAttributes()
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
   * @returns Whether the buffer tier changed (requiring batch rebuild).
   */
  registerEffect(effectClass: typeof MaterialEffect): boolean {
    // Ensure static initialization
    effectClass._initialize()

    // Skip if already registered
    if (this._effectBitIndex.has(effectClass.effectName)) return false

    // 1. Push effect class and assign bit index
    this._effects.push(effectClass)
    const bitIndex = this._effects.length - 1
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
  protected _buildBaseColor(): { color: TSLNode; uv: TSLNode } | null {
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
   * Rebuild the colorNode from scratch: base color + effect chain.
   * Called when texture is set or effects are registered.
   *
   * The _buildBaseColor() hook is called inside the Fn() context so that
   * TSL statements like If/Discard work correctly.
   * @internal
   */
  _rebuildColorNode(): void {
    if (!this._canBuildColor()) return

    // Capture references for use inside Fn closure
    const self = this

    // Pre-build packed buffer TSL nodes for effects (can be outside Fn)
    const numVec4s = this._effectTier / 4
    const bufNodes: TSLNode[] = []
    for (let i = 0; i < numVec4s; i++) {
      bufNodes.push(attribute(`effectBuf${i}`, 'vec4'))
    }

    // Pre-build per-effect data: bit index and reconstructed attrs (can be outside Fn)
    const effectData: Array<{
      effectClass: typeof MaterialEffect
      bitIndex: number
      attrs: Record<string, TSLNode>
    }> = []

    for (const effectClass of this._effects) {
      const bitIndex = this._effectBitIndex.get(effectClass.effectName)!
      const attrs: Record<string, TSLNode> = {}

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

      effectData.push({ effectClass, bitIndex, attrs })
    }

    // Build color node: base color + effect chain (all inside Fn for TSL context)
    this.colorNode = Fn(() => {
      const baseResult = self._buildBaseColor()
      if (!baseResult) return vec4(0, 0, 0, 0)

      let { color } = baseResult
      const { uv: atlasUV } = baseResult

      // Chain effects with branchless enable/disable via packed bitmask
      if (effectData.length > 0) {
        const flags = getPackedComponent(bufNodes, 0)

        for (const { effectClass, bitIndex, attrs } of effectData) {
          // Extract enable bit: floor(mod(flags / 2^bitIndex, 2))
          const divisor = float(1 << bitIndex)
          const shifted = floor(flags.div(divisor))
          const enabled = mod(shifted, float(2.0))

          const effectResult = effectClass._node({
            inputColor: color,
            inputUV: atlasUV,
            attrs,
          })

          // Branchless: mix(original, effectResult, enabled)
          color = mix(color, effectResult, enabled)
        }
      }

      return color
    })()
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
