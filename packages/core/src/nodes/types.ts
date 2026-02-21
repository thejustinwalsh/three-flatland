import type Node from 'three/src/nodes/core/Node.js'

/**
 * TSL Node type — the base type for all Three.js shader nodes.
 *
 * Three.js augments the `Node` class with method chaining (`.rgb`, `.mul()`,
 * `.a`, etc.) via module augmentation in `@types/three`. This type alias
 * ensures all our TSL functions use the augmented `Node` type directly,
 * so they compose naturally with Three.js TSL functions without casts.
 */
export type TSLNode = Node

/**
 * Input that can be either a literal value or a TSL node (uniform).
 * Allows functions to accept both static values and dynamic uniforms.
 */
export type TSLInput<T> = T | Node

/**
 * Vec2 input type - accepts tuple or TSL node
 */
export type Vec2Input = [number, number] | Node

/**
 * Vec3 input type - accepts tuple or TSL node
 */
export type Vec3Input = [number, number, number] | Node

/**
 * Vec4 input type - accepts tuple or TSL node
 */
export type Vec4Input = [number, number, number, number] | Node

/**
 * Float input type - accepts number or TSL node
 */
export type FloatInput = number | Node

/**
 * Color input type - accepts hex, RGB tuple, or TSL node
 */
export type ColorInput = number | [number, number, number] | Node
