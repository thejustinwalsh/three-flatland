import type Node from 'three/src/nodes/core/Node.js'

/**
 * Input that can be either a literal number or a float Node.
 */
export type FloatInput = number | Node<'float'>

/**
 * Vec2 input type - accepts tuple or vec2 Node
 */
export type Vec2Input = [number, number] | Node<'vec2'>

/**
 * Vec3 input type - accepts tuple or vec3 Node
 */
export type Vec3Input = [number, number, number] | Node<'vec3'>

/**
 * Vec4 input type - accepts tuple or vec4 Node
 */
export type Vec4Input = [number, number, number, number] | Node<'vec4'>

/**
 * Color input type - accepts hex, RGB tuple, or color/vec3 Node
 */
export type ColorInput = number | [number, number, number] | Node<'color'> | Node<'vec3'>
