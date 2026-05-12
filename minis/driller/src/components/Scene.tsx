import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D, Sprite2DMaterial, type Flatland as FlatlandType } from 'three-flatland/react'
import { useWorld } from 'koota/react'
import type { World } from 'koota'
import { NearestFilter, RenderTarget } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { Camera, GameState, Grid, type RunState } from '../traits'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { autotilePass } from '../systems/autotile-pass'
import { cameraSystem } from '../systems/camera'
import { collapseTick } from '../systems/collapse'
import { deathSystem, heroWorldFallSystem, scatteredGemsSystem } from '../systems/death'
import { drillerSystem, moodDriftSystem } from '../systems/driller'
import { explosiveSystem } from '../systems/explosive'
import { gemGravitySystem } from '../systems/gem-gravity'
import { gemExpirySystem } from '../systems/gem-expiry'
import { pointerHeldTick } from '../systems/input'
import { dragSystem } from '../systems/drag'
import { gemSpendPopupSystem } from '../systems/gem-spend'
import { plannerTick } from '../systems/ai-planner'
import { resetStreaming, streamChunks } from '../systems/generation'
import { hazardSpawnSystem, hazardTickSystem, resetAvalanche, resetHazardSpawn, rockAvalancheSystem } from '../systems/hazard'
import { particlesSystem } from '../systems/particles'
import { useDigitsMaterial, useDrillerMaterial, useIconsMaterial, useOutlineMaterial } from '../materials'
import { DebugPanel, shouldShowDebugPanel } from './DebugPanel'
import { DrillerView } from './DrillerView'
import { FallingChunkView } from './FallingChunkView'
import { GemRenderer } from './GemRenderer'
import { HoverOutlineRenderer } from './HoverOutlineRenderer'
import { GemSpendPopupRenderer } from './GemSpendPopupRenderer'
import { InfoPopupRenderer } from './InfoPopupRenderer'
import { OverPetRenderer } from './OverPetRenderer'
import { MoodBubbleRenderer } from './MoodBubbleRenderer'
import { GhostBeam } from './GhostBeam'
import { HazardView } from './HazardView'
import { TileRenderer } from './TileRenderer'
import { Compositor } from './Compositor'
import { buildBiomeGradientMesh } from '../lib/biome-gradient-material'
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

/**
 * Fixed simulation rate. Every tick advances the world by exactly
 * this much wall-clock time, regardless of monitor refresh rate.
 * 60Hz keeps the per-tick budget readable (16.67ms) and matches the
 * documented timings in constants.ts (SAG_DURATION_TICKS et al).
 */
const TICK_HZ = 60
const TICK_DT = 1 / TICK_HZ
const TICK_DT_MS = 1000 / TICK_HZ
/**
 * Cap on how many simulation steps we run in a single render frame.
 * Without this, a stalled tab (background, breakpoint, GC pause)
 * accumulates a huge delta and tries to "catch up" by running 100s
 * of ticks at once — which then stalls the next frame and spirals.
 * 8 steps = up to 133ms of catch-up per frame, plenty for a hiccup
 * but bounded against the death spiral.
 */
const MAX_STEPS_PER_FRAME = 8

export function Scene({ onShellStateChange }: SceneProps) {
  const world = useWorld()
  const flatlandRef = useRef<FlatlandType>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const material = useDrillerMaterial()
  const outlineMaterial = useOutlineMaterial()
  const iconsMaterial = useIconsMaterial()
  const digitsMaterial = useDigitsMaterial()
  const accumRef = useRef(0)

  // Game render target — Flatland renders into this texture at the
  // gameplay rect's LOGICAL pixel size (288 × 640 = PLAY_COLS × PLAY_ROWS
  // × TILE_PX). The compositor (sibling component) samples this texture
  // for the blurred ambient bg AND the pixel-perfect foreground draw.
  // Static size: changing scale doesn't resize the RT, only the
  // foreground quad's screen-space size.
  const gameRt = useMemo(() => {
    const rt = new RenderTarget(PLAY_COLS * TILE_PX, PLAY_ROWS * TILE_PX)
    rt.texture.minFilter = NearestFilter
    rt.texture.magFilter = NearestFilter
    rt.texture.generateMipmaps = false
    return rt
  }, [])

  // Biome gradient mesh — lives INSIDE Flatland's scene as a sibling
  // of the sprite group. Renders into the same RT as the game
  // sprites, so the RT naturally contains the composite of gradient
  // + sprites. The mesh covers the camera frustum and is repositioned
  // each frame to track the camera.
  const gradient = useMemo(() => buildBiomeGradientMesh(), [])
  // Attach the mesh once the Flatland is mounted.
  useEffect(() => {
    const fl = flatlandRef.current
    if (!fl) return
    fl.add(gradient.mesh)
    return () => {
      fl.remove(gradient.mesh)
    }
  }, [gradient])

  // Update phase: fixed-timestep simulation accumulator.
  // Render frame rate (variable: 30/60/120/144Hz) is decoupled from
  // simulation tick rate (constant 60Hz). Every render frame we
  // accumulate the wall-clock delta and run 0..MAX_STEPS_PER_FRAME
  // simulation ticks until the accumulator drops below TICK_DT, then
  // sync render-side state. Effect: SAG_PRECARIOUS_TICKS=36 always
  // means 600ms wall-clock, on any monitor.
  useFrame((_, delta) => {
    if (!world.has(GameState)) return
    accumRef.current = Math.min(accumRef.current + delta, 0.25)
    let steps = 0
    while (accumRef.current >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      accumRef.current -= TICK_DT
      steps++
      runSimulationTick(world)
    }
    syncRenderState(world, flatlandRef.current, onShellStateChange)
    // Reposition the biome gradient mesh to track the Flatland camera
    // and update the parallax uniform. cam.y is pixel-precision but
    // the lerp in cameraSystem converges to a TILE_PX-multiple target,
    // so the camera lands row-aligned at rest while scrolling smoothly
    // pixel-by-pixel in between.
    const cam = world.get(Camera)
    if (cam) {
      const halfH = (PLAY_ROWS * TILE_PX) / 2
      const halfW = (PLAY_COLS * TILE_PX) / 2
      gradient.mesh.position.x = halfW
      gradient.mesh.position.y = -(cam.y + halfH)
      gradient.camYUniform.value = cam.y
    }
  })

  // Render phase: two-pass.
  //   1. Flatland → RT (game scene at logical resolution)
  //   2. R3F default scene → canvas (the compositor's bg/ambient/fg
  //      quads sample gameRt.texture). The compositor lives in the
  //      default scene because it's NOT a Flatland sprite — it's a
  //      handful of fullscreen-ish quads with custom TSL materials.
  useFrame((state) => {
    const flatland = flatlandRef.current
    if (!flatland) return
    // Flatland resizes the RT internally (via setSize) — pass the
    // logical pixel size so it doesn't try to match the canvas.
    flatland.resize(PLAY_COLS * TILE_PX, PLAY_ROWS * TILE_PX)
    flatland.render(gl as unknown as WebGPURenderer)
    // After Flatland.render, the renderer's target is restored to
    // null (the canvas). Now render the R3F default scene.
    state.gl.render(state.scene, state.camera)
  }, { phase: 'render' })

  const cam = world.get(Camera)
  const viewSize = (cam?.rows ?? PLAY_ROWS) * TILE_PX

  return (
    <>
      <flatland
        ref={flatlandRef}
        viewSize={viewSize}
        clearColor={0x0a0a14}
        clearAlpha={0}
        renderTarget={gameRt}
      >
        <TileRenderer material={material} />
        <FallingChunkView material={material} />
        <GemRenderer material={material} />
        <HazardView material={material} />
        <DrillerView material={material} />
        <GhostBeam material={material} />
        <HoverOutlineRenderer outlineMaterial={outlineMaterial} fillMaterial={material} />
        <GemSpendPopupRenderer iconsMaterial={iconsMaterial} digitsMaterial={digitsMaterial} />
        <InfoPopupRenderer iconsMaterial={iconsMaterial} barMaterial={material} />
        <MoodBubbleRenderer iconsMaterial={iconsMaterial} bubbleMaterial={material} />
        <OverPetRenderer iconsMaterial={iconsMaterial} />
        {shouldShowDebugPanel() && <DebugPanel />}
      </flatland>
      <Compositor gameTexture={gameRt.texture} viewportSize={size} />
    </>
  )
}

/**
 * One fixed-timestep simulation step. Advances `GameState.tick` by 1
 * and runs every simulation system with a constant deltaMs. Pure
 * function over the world — no rendering, no React state.
 */
function runSimulationTick(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  world.set(GameState, { tick: gs.tick + 1 })
  const deltaMs = TICK_DT_MS

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
    resetHazardSpawn()
    resetAvalanche()
    const grid = world.get(Grid)
    if (grid) {
      grid.tiles.fill(0)
      grid.flags.fill(0)
      grid.frameIndex.fill(0)
      grid.hits.fill(0)
    }
  }

  const gsNow = world.get(GameState)
  if (gsNow && gsNow.runState === 'playing') {
    moodDriftSystem(world, gsNow.tick)
    plannerTick(world)
    drillerSystem(world, deltaMs)
    hazardSpawnSystem(world)
    pointerHeldTick(world)
    dragSystem(world)
  }
  hazardTickSystem(world)
  rockAvalancheSystem(world)
  explosiveSystem(world)
  gemGravitySystem(world, deltaMs)
  gemExpirySystem(world)
  gemSpendPopupSystem(world)
  collapseTick(world)
  particlesSystem(world, deltaMs)
  autotilePass(world)
}

/**
 * Per-frame render-side sync. Runs once per render frame (NOT per
 * simulation tick) so React setState and the camera→Flatland sync
 * happen at display rate. Reading the latest simulation state.
 */
function syncRenderState(
  world: World,
  flatland: FlatlandType | null,
  onShellStateChange: Dispatch<SetStateAction<ShellState>>,
): void {
  const gsNow = world.get(GameState)
  if (!gsNow) return
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
  //
  // cam.y is pixel-precision and converges to a TILE_PX-multiple target
  // (see cameraSystem) — full rows align to the viewport at rest, while
  // smooth pixel scroll happens between rows.
  const cam = world.get(Camera)
  if (cam && flatland) {
    const halfH = (cam.rows * TILE_PX) / 2
    const halfW = (PLAY_COLS * TILE_PX) / 2
    flatland.camera.position.x = halfW
    flatland.camera.position.y = -(cam.y + halfH)
    if (typeof window !== 'undefined') (window as { __drillerFlat?: unknown }).__drillerFlat = flatland
  }
}
