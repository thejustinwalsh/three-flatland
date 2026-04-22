import { vec3, float } from 'three/tsl'
import { createMaterialEffect } from 'three-flatland'

/**
 * Provides the 'normal' channel from a discrete per-instance orientation
 * enum. Intended for tilemaps in 3/4-view pixel-art games, where walls
 * are rendered as flat sprite tiles but logically represent vertical
 * surfaces that should not receive light from "behind" them.
 *
 * Consumers set the `normalKind` field per tile via the tilemap's tile
 * custom properties — any tile whose `TileDefinition.properties` object
 * has a `normalKind: <0-4>` entry writes that value into the instance
 * buffer at tilemap build time. Tiles without the property default to
 * orientation 0 (flat, faces camera — normal +Z).
 *
 * Orientations:
 * - `0` — flat (floor): `(0, 0, 1)`
 * - `1` — wallBack  (wall at top of screen, face points −Y): `(0, -0.7, 0.7)`
 * - `2` — wallFront (wall at bottom of screen, face points +Y): `(0,  0.7, 0.7)`
 * - `3` — wallLeft  (wall on left side, face points +X):       `( 0.7, 0, 0.7)`
 * - `4` — wallRight (wall on right side, face points −X):      `(-0.7, 0, 0.7)`
 *
 * The tilted-45° component means the normals still have a healthy +Z so
 * walls aren't completely black to straight-overhead lights — they
 * primarily react to lights on their "front" side and fall off smoothly
 * as the light angle moves behind them.
 *
 * @example
 * ```tsx
 * // Tilemap authoring: set custom property `normalKind` on wall tiles.
 * <tileMap2D data={mapData}>
 *   <tileNormalProvider attach={attachEffect} />
 * </tileMap2D>
 * ```
 */
export const TileNormalProvider = createMaterialEffect({
  name: 'tileNormal',
  schema: {
    /** Orientation enum: 0=flat, 1=wallBack, 2=wallFront, 3=wallLeft, 4=wallRight. */
    normalKind: 0,
  } as const,
  provides: ['normal'],
  channelNode(_channelName, { attrs }) {
    const k = attrs.normalKind
    const nFlat = vec3(0, 0, 1)
    const nBack = vec3(0, -0.7, 0.7)
    const nFront = vec3(0, 0.7, 0.7)
    const nLeft = vec3(0.7, 0, 0.7)
    const nRight = vec3(-0.7, 0, 0.7)
    // Chained select on the float enum. Nearest-integer thresholds
    // (0.5, 1.5, 2.5, 3.5) give a clean mapping from integer values
    // into fixed normals without any TSL branch instructions.
    const picked = k
      .greaterThan(float(3.5))
      .select(
        nRight,
        k
          .greaterThan(float(2.5))
          .select(
            nLeft,
            k
              .greaterThan(float(1.5))
              .select(nFront, k.greaterThan(float(0.5)).select(nBack, nFlat))
          )
      )
    return picked.normalize()
  },
})
