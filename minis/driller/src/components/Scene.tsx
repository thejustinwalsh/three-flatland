import { useRef } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D, Sprite2DMaterial, type Flatland as FlatlandType } from 'three-flatland/react'
import { useWorld } from 'koota/react'
import type { WebGPURenderer } from 'three/webgpu'
import { Camera, GameState } from '../traits'
import { TILE_PX } from '../constants'
import { cameraSystem } from '../systems/camera'

extend({ Flatland, Sprite2D, Sprite2DMaterial })

/**
 * Renders the gameplay scene.
 *
 * - Owns the singleton Flatland renderer (sprite batching + camera).
 * - Drives the simulation tick (game logic) in the default 'update' phase.
 * - Composites in the 'render' phase via `flatland.render(gl)`, telling
 *   R3F to skip its own scene render.
 *
 * Phase 4: empty Flatland (no sprites yet); camera follow + tick increment
 * verified visually. Sprites land in Phase 5+.
 */
export function Scene() {
  const world = useWorld()
  const flatlandRef = useRef<FlatlandType>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  // Update phase: simulation logic
  useFrame(() => {
    if (!world.has(GameState)) return
    const gs = world.get(GameState)
    if (!gs) return
    gs.tick++

    cameraSystem(world)

    // Apply camera trait to Flatland's internal orthographic camera.
    const cam = world.get(Camera)
    const flatland = flatlandRef.current
    if (cam && flatland) {
      // World Y grows downward (cell rows); flip sign for Three's Y-up convention.
      flatland.camera.position.y = -cam.y
    }
  })

  // Render phase: composite. Skips R3F's default scene render.
  useFrame(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.resize(size.width, size.height)
    flatland.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  // viewSize in pixels — matches one rendered "world unit" to one source pixel.
  const cam = world.get(Camera)
  const viewSize = (cam?.rows ?? 22) * TILE_PX

  return (
    <flatland
      ref={flatlandRef}
      viewSize={viewSize}
      clearColor={0x0a0a14}
      clearAlpha={0}
    >
      {/* sprites added in subsequent phases */}
    </flatland>
  )
}
