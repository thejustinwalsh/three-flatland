import { useRef, type Dispatch, type SetStateAction } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D, Sprite2DMaterial, type Flatland as FlatlandType } from 'three-flatland/react'
import { useWorld } from 'koota/react'
import type { WebGPURenderer } from 'three/webgpu'
import { Camera, GameState, Grid, type RunState } from '../traits'
import { TILE_PX } from '../constants'
import { autotilePass } from '../systems/autotile-pass'
import { cameraSystem } from '../systems/camera'
import { collapseTick } from '../systems/collapse'
import { deathSystem, heroWorldFallSystem, scatteredGemsSystem } from '../systems/death'
import { drillerSystem, moodDriftSystem } from '../systems/driller'
import { plannerTick } from '../systems/ai-planner'
import { resetStreaming, streamChunks } from '../systems/generation'
import { particlesSystem } from '../systems/particles'
import { useDrillerMaterial } from '../materials'
import { DrillerView } from './DrillerView'
import { GemRenderer } from './GemRenderer'
import { TileRenderer } from './TileRenderer'
import { shallowEqual } from '../shallow'

extend({ Flatland, Sprite2D, Sprite2DMaterial })

export interface ShellState {
  runState: RunState
  gems: number
  depthM: number
  deepestM: number
  lives: number
}

interface SceneProps {
  onShellStateChange: Dispatch<SetStateAction<ShellState>>
}

export function Scene({ onShellStateChange }: SceneProps) {
  const world = useWorld()
  const flatlandRef = useRef<FlatlandType>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const material = useDrillerMaterial()

  // Update phase: simulation systems + shell-state sync.
  useFrame((_, delta) => {
    if (!world.has(GameState)) return
    const gs = world.get(GameState)
    if (!gs) return
    world.set(GameState, { tick: gs.tick + 1 })
    void delta
    const deltaMs = Math.min(delta, 0.05) * 1000

    cameraSystem(world)

    const camForStream = world.get(Camera)
    if (camForStream) {
      const cameraRow = Math.floor(camForStream.y / TILE_PX)
      streamChunks(world, cameraRow)
    }

    deathSystem(world)
    scatteredGemsSystem(world)

    const prevWorldNumber = gs.worldNumber
    heroWorldFallSystem(world)
    const gsAfterFall = world.get(GameState)
    if (gsAfterFall && gsAfterFall.worldNumber !== prevWorldNumber) {
      resetStreaming()
      const grid = world.get(Grid)
      if (grid) {
        grid.tiles.fill(0)
        grid.flags.fill(0)
        grid.frameIndex.fill(0)
      }
    }

    const gsNow = world.get(GameState)
    if (gsNow && gsNow.runState === 'playing') {
      moodDriftSystem(world, gsNow.tick)
      plannerTick(world)
      drillerSystem(world, deltaMs)
    }
    collapseTick(world)
    particlesSystem(world, deltaMs)
    autotilePass(world)

    // Sync shell state to React parent — shallow-compare to avoid
    // unnecessary setState calls.
    if (gsNow) {
      const next: ShellState = {
        runState: gsNow.runState,
        gems: gsNow.gems,
        depthM: gsNow.depthM,
        deepestM: gsNow.deepestM,
        lives: gsNow.lives,
      }
      onShellStateChange((prev) => (shallowEqual(prev, next) ? prev : next))

      // Apply camera trait to Flatland's internal orthographic camera.
      // World cell Y grows downward (row 0 at top); the camera in Three uses
      // Y-up. Center the camera vertically: cam.y is the top of the visible
      // play window in world pixels, so the camera looks at y = -(cam.y + halfH).
      const cam = world.get(Camera)
      const flatland = flatlandRef.current
      if (cam && flatland) {
        const halfH = (cam.rows * TILE_PX) / 2
        flatland.camera.position.y = -(cam.y + halfH)
      }
    }
  })

  // Render phase: composite. Skips R3F's default scene render.
  useFrame(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.resize(size.width, size.height)
    flatland.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  const cam = world.get(Camera)
  const viewSize = (cam?.rows ?? 22) * TILE_PX

  return (
    <flatland
      ref={flatlandRef}
      viewSize={viewSize}
      clearColor={0x0a0a14}
      clearAlpha={0}
    >
      <TileRenderer material={material} />
      <GemRenderer material={material} />
      <DrillerView material={material} />
    </flatland>
  )
}
