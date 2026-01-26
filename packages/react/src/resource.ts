// @three-flatland/react/resource
// React 19 resource utilities for three-flatland

import {
  SpriteSheetLoader,
  TextureLoader,
  type SpriteSheet,
  type TextureLoaderOptions,
} from '@three-flatland/core'
import type { Texture } from 'three'

/**
 * Create a resource for React 19's use() hook
 * Used for suspenseful loading of textures and other assets
 *
 * @example
 * ```tsx
 * import { createResource } from '@three-flatland/react/resource'
 *
 * const textureResource = createResource(() => loadTexture('/sprite.png'))
 *
 * function Sprite() {
 *   const texture = use(textureResource)
 *   return <sprite texture={texture} />
 * }
 * ```
 */
export function createResource<T>(loader: () => Promise<T>): Promise<T> {
  // Simple wrapper for now - can be enhanced with caching later
  return loader()
}

/**
 * Create a cached resource that only loads once
 */
export function createCachedResource<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cache = (globalThis as Record<string, unknown>).__flatlandResourceCache as
    | Map<string, Promise<T>>
    | undefined

  if (!cache) {
    ;(globalThis as Record<string, unknown>).__flatlandResourceCache = new Map<string, Promise<T>>()
  }

  const resourceCache = (globalThis as Record<string, unknown>).__flatlandResourceCache as Map<
    string,
    Promise<T>
  >

  if (!resourceCache.has(key)) {
    resourceCache.set(key, loader())
  }

  return resourceCache.get(key)!
}

/**
 * Create a SpriteSheet resource for use with React 19's use() hook.
 *
 * @example
 * ```tsx
 * import { spriteSheet } from '@three-flatland/react/resource'
 * import { use } from 'react'
 *
 * const playerSheet = spriteSheet('/sprites/player.json')
 *
 * function Player() {
 *   const sheet = use(playerSheet)
 *   return <sprite2D texture={sheet.texture} frame={sheet.getFrame('idle_0')} />
 * }
 * ```
 */
export function spriteSheet(url: string): Promise<SpriteSheet> {
  return SpriteSheetLoader.load(url)
}

/**
 * Create a Texture resource for use with React 19's use() hook.
 *
 * Supports the hierarchical preset system:
 * 1. Per-call options (highest priority)
 * 2. TextureLoader.options (loader default)
 * 3. TextureConfig.options (global default)
 * 4. 'pixel-art' (system default)
 *
 * @example
 * ```tsx
 * import { texture } from '@three-flatland/react/resource'
 * import { use } from 'react'
 *
 * // Use global defaults (pixel-art)
 * const myTexture = texture('/sprites/player.png')
 *
 * // Override for this texture
 * const hdTexture = texture('/sprites/ui.png', { texture: 'smooth' })
 *
 * function Player() {
 *   const tex = use(myTexture)
 *   return <sprite2D texture={tex} />
 * }
 * ```
 */
export function texture(url: string, options?: TextureLoaderOptions): Promise<Texture> {
  return TextureLoader.load(url, options)
}
