import type Node from 'three/src/nodes/core/Node.js'
import { vec3 } from 'three/tsl'

/**
 * Well-known channel name — named per-fragment data that effects can require.
 * Users extend via module augmentation on ChannelNodeMap for custom channels.
 */
export type ChannelName = keyof ChannelNodeMap

/**
 * Maps well-known channel names to their TSL node types.
 * Users extend via module augmentation for custom channels:
 *
 * @example
 * ```typescript
 * declare module 'three-flatland' {
 *   interface ChannelNodeMap {
 *     roughness: Node<'float'>
 *     emissive: Node<'vec3'>
 *   }
 * }
 * ```
 */
export interface ChannelNodeMap {
  normal: Node<'vec3'>
}

/**
 * Narrows a type by adding required channel properties.
 * Known channels use mapped types; unknown channels fall back to Node.
 *
 * Used by createLightEffect to type the light callback context —
 * if requires: ['normal'], then ctx.normal is Node<'vec3'> (guaranteed).
 */
export type WithRequiredChannels<C extends readonly string[]> = {
  [K in C[number]]: K extends keyof ChannelNodeMap ? ChannelNodeMap[K] : Node
}

/**
 * Default TSL node factories for well-known channels.
 * When a colorTransform requires a channel but no provider effect supplies it,
 * the pipeline fills it from this map. Users can register defaults for custom
 * channels by adding entries.
 */
export const channelDefaults: Record<string, () => Node> = {
  /** Flat-facing normal — sprites with no normal-map provider get uniform (0, 0, 1). */
  normal: () => vec3(0, 0, 1),
}
