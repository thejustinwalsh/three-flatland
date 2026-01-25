import type { Sprite2D } from '../sprites/Sprite2D'
import type { LayerConfig, BlendMode, SortMode } from './types'
import { Layers } from './layers'

/**
 * A managed layer containing sprites.
 */
export class Layer {
  /**
   * Layer name.
   */
  readonly name: string

  /**
   * Layer value (render order).
   */
  readonly value: number

  /**
   * Sprites in this layer.
   */
  private _sprites: Set<Sprite2D> = new Set()

  /**
   * Blend mode for this layer.
   */
  blendMode: BlendMode

  /**
   * Sort mode for sprites in this layer.
   */
  sortMode: SortMode

  /**
   * Whether this layer is visible.
   */
  private _visible: boolean = true

  /**
   * Callback when visibility changes.
   */
  onVisibilityChange?: (visible: boolean) => void

  constructor(config: LayerConfig) {
    this.name = config.name
    this.value = config.value
    this.blendMode = config.blendMode ?? 'normal'
    this.sortMode = config.sortMode ?? 'z-index'
    this._visible = config.visible ?? true
  }

  /**
   * Get sprites in this layer.
   */
  get sprites(): ReadonlySet<Sprite2D> {
    return this._sprites
  }

  /**
   * Get sprite count.
   */
  get count(): number {
    return this._sprites.size
  }

  /**
   * Get visibility.
   */
  get visible(): boolean {
    return this._visible
  }

  /**
   * Set visibility.
   */
  set visible(value: boolean) {
    if (this._visible === value) return
    this._visible = value

    // Update sprite visibility
    for (const sprite of this._sprites) {
      sprite.visible = value
    }

    this.onVisibilityChange?.(value)
  }

  /**
   * Add a sprite to this layer.
   */
  add(sprite: Sprite2D): void {
    sprite.layer = this.value
    sprite.visible = this._visible
    this._sprites.add(sprite)
  }

  /**
   * Remove a sprite from this layer.
   */
  remove(sprite: Sprite2D): void {
    this._sprites.delete(sprite)
  }

  /**
   * Check if layer contains a sprite.
   */
  has(sprite: Sprite2D): boolean {
    return this._sprites.has(sprite)
  }

  /**
   * Clear all sprites from this layer.
   */
  clear(): void {
    this._sprites.clear()
  }

  /**
   * Iterate over sprites in this layer.
   */
  [Symbol.iterator](): Iterator<Sprite2D> {
    return this._sprites.values()
  }
}

/**
 * Manages render layers for 2D scenes.
 *
 * Provides a higher-level API for organizing sprites into layers.
 * Use with Renderer2D for automatic batching and sorting.
 *
 * @example
 * ```typescript
 * const layers = new LayerManager()
 *
 * // Create layers
 * const entities = layers.createLayer({ name: 'entities', value: Layers.ENTITIES })
 * const effects = layers.createLayer({ name: 'effects', value: Layers.EFFECTS })
 *
 * // Add sprites to layers
 * layers.addToLayer('entities', playerSprite)
 * layers.addToLayer('effects', particleSprite)
 *
 * // Toggle layer visibility
 * layers.setLayerVisible('effects', false)
 * ```
 */
export class LayerManager {
  /**
   * Layers by name.
   */
  private _layers: Map<string, Layer> = new Map()

  /**
   * Layers by value (for fast lookup).
   */
  private _layersByValue: Map<number, Layer> = new Map()

  /**
   * Create default layers based on the Layers constant.
   */
  static withDefaults(): LayerManager {
    const manager = new LayerManager()

    // Create layers from Layers constant
    for (const [name, value] of Object.entries(Layers)) {
      manager.createLayer({
        name: name.toLowerCase(),
        value: value as number,
      })
    }

    return manager
  }

  /**
   * Create a new layer.
   */
  createLayer(config: LayerConfig): Layer {
    if (this._layers.has(config.name)) {
      throw new Error(`Layer "${config.name}" already exists`)
    }

    const layer = new Layer(config)
    this._layers.set(config.name, layer)
    this._layersByValue.set(config.value, layer)

    return layer
  }

  /**
   * Get a layer by name.
   */
  getLayer(name: string): Layer | undefined {
    return this._layers.get(name)
  }

  /**
   * Get a layer by value.
   */
  getLayerByValue(value: number): Layer | undefined {
    return this._layersByValue.get(value)
  }

  /**
   * Remove a layer.
   */
  removeLayer(name: string): boolean {
    const layer = this._layers.get(name)
    if (!layer) return false

    this._layers.delete(name)
    this._layersByValue.delete(layer.value)

    return true
  }

  /**
   * Add a sprite to a layer.
   */
  addToLayer(layerName: string, sprite: Sprite2D): void {
    const layer = this._layers.get(layerName)
    if (!layer) {
      throw new Error(`Layer "${layerName}" not found`)
    }
    layer.add(sprite)
  }

  /**
   * Remove a sprite from its current layer.
   */
  removeFromLayer(sprite: Sprite2D): void {
    const layer = this._layersByValue.get(sprite.layer)
    if (layer) {
      layer.remove(sprite)
    }
  }

  /**
   * Move a sprite to a different layer.
   */
  moveToLayer(sprite: Sprite2D, newLayerName: string): void {
    // Remove from current layer
    this.removeFromLayer(sprite)

    // Add to new layer
    const newLayer = this._layers.get(newLayerName)
    if (!newLayer) {
      throw new Error(`Layer "${newLayerName}" not found`)
    }
    newLayer.add(sprite)
  }

  /**
   * Set layer visibility.
   */
  setLayerVisible(name: string, visible: boolean): void {
    const layer = this._layers.get(name)
    if (!layer) {
      throw new Error(`Layer "${name}" not found`)
    }
    layer.visible = visible
  }

  /**
   * Get layer visibility.
   */
  isLayerVisible(name: string): boolean {
    const layer = this._layers.get(name)
    if (!layer) {
      throw new Error(`Layer "${name}" not found`)
    }
    return layer.visible
  }

  /**
   * Toggle layer visibility.
   */
  toggleLayerVisible(name: string): boolean {
    const layer = this._layers.get(name)
    if (!layer) {
      throw new Error(`Layer "${name}" not found`)
    }
    layer.visible = !layer.visible
    return layer.visible
  }

  /**
   * Get all layer names.
   */
  getLayerNames(): string[] {
    return Array.from(this._layers.keys())
  }

  /**
   * Get all layers.
   */
  getLayers(): Layer[] {
    return Array.from(this._layers.values())
  }

  /**
   * Check if a layer exists.
   */
  hasLayer(name: string): boolean {
    return this._layers.has(name)
  }

  /**
   * Get the number of layers.
   */
  get count(): number {
    return this._layers.size
  }

  /**
   * Clear all layers.
   */
  clear(): void {
    for (const layer of this._layers.values()) {
      layer.clear()
    }
    this._layers.clear()
    this._layersByValue.clear()
  }

  /**
   * Iterate over layers.
   */
  [Symbol.iterator](): Iterator<Layer> {
    return this._layers.values()
  }
}
