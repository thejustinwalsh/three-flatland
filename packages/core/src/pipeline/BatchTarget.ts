import type { Matrix4 } from 'three'
import type { InstancedBufferAttribute } from 'three'

/**
 * Interface for batch targets that sprites can write to.
 * This allows sprites to write directly to batch buffers without
 * tight coupling or circular dependencies.
 */
export interface BatchTarget {
  /**
   * Write color (tint + alpha) for a sprite at the given index.
   */
  writeColor(index: number, r: number, g: number, b: number, a: number): void

  /**
   * Write UV frame data for a sprite at the given index.
   */
  writeUV(index: number, x: number, y: number, w: number, h: number): void

  /**
   * Write flip flags for a sprite at the given index.
   */
  writeFlip(index: number, flipX: number, flipY: number): void

  /**
   * Write transform matrix for a sprite at the given index.
   */
  writeMatrix(index: number, matrix: Matrix4): void

  /**
   * Write a custom instance attribute value.
   */
  writeCustom(index: number, name: string, value: number | number[]): void

  /**
   * Write a single float to a specific component of a packed effect buffer.
   * Used for per-slot writes to effectBuf0, effectBuf1, etc.
   *
   * @param index - Sprite index in the batch
   * @param bufferIndex - Which effect buffer (0, 1, 2, ...)
   * @param component - Which vec4 component (0=x, 1=y, 2=z, 3=w)
   * @param value - Float value to write
   */
  writeEffectSlot(index: number, bufferIndex: number, component: number, value: number): void

  /**
   * Get a custom attribute buffer by name (for sprites that need direct access).
   */
  getCustomBuffer(name: string): { buffer: Float32Array; size: number } | undefined

  /**
   * Get the instanceColor attribute for marking needsUpdate.
   */
  getColorAttribute(): InstancedBufferAttribute

  /**
   * Get the instanceUV attribute for marking needsUpdate.
   */
  getUVAttribute(): InstancedBufferAttribute

  /**
   * Get the instanceFlip attribute for marking needsUpdate.
   */
  getFlipAttribute(): InstancedBufferAttribute

  /**
   * Get a custom attribute by name for marking needsUpdate.
   */
  getCustomAttribute(name: string): InstancedBufferAttribute | undefined
}
