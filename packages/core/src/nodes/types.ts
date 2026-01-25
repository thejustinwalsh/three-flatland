import type Node from 'three/src/nodes/core/Node.js'

/**
 * TSL Node type alias for shader node objects.
 * This is the common return type for all TSL node functions.
 *
 * In TSL, nodes are wrapped in a Proxy that enables method chaining
 * (e.g., color.rgb.mul(0.5).add(1)). This type captures the base Node
 * while allowing the extended chaining capabilities.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TSLNode = Node & Record<string, any>

/**
 * Input that can be either a literal value or a TSL node (uniform).
 * Allows functions to accept both static values and dynamic uniforms.
 */
export type TSLInput<T> = T | TSLNode

/**
 * Vec2 input type - accepts tuple or TSL node
 */
export type Vec2Input = [number, number] | TSLNode

/**
 * Vec3 input type - accepts tuple or TSL node
 */
export type Vec3Input = [number, number, number] | TSLNode

/**
 * Vec4 input type - accepts tuple or TSL node
 */
export type Vec4Input = [number, number, number, number] | TSLNode

/**
 * Float input type - accepts number or TSL node
 */
export type FloatInput = number | TSLNode

/**
 * Color input type - accepts hex, RGB tuple, or TSL node
 */
export type ColorInput = number | [number, number, number] | TSLNode
