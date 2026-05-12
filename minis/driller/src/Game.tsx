import { useCallback, useEffect, useRef, useState } from 'react'
import { WorldProvider } from 'koota/react'
import { getWorld } from './world'
import { Camera, Drag, GameState, Grid, Pointer, Seed } from './traits'
import { PlayCanvas } from './components/PlayCanvas'
import { Background } from './components/Background'
import { BiomeTransition } from './components/BiomeTransition'
import { Scene, type ShellState } from './components/Scene'
import { DepthBar } from './components/DepthBar'
import { GemCounter } from './components/GemCounter'
import { HeroHint } from './components/HeroHint'
import { TitleAttract } from './components/TitleAttract'
import { Leaderboard, loadLeaderboard } from './components/Leaderboard'
import { resetStreaming } from './systems/generation'
import { commitAction, pointerWorldCell, resolveHoverAction } from './systems/input'
import { endDrag, startDrag } from './systems/drag'
import type { DrillerProps } from './types'
import type { PlayCanvasMetrics } from './lib/scale'

/**
 * Driller mini-game root component.
 *
 * Mode-aware composition:
 * - `hero`: Background + PlayCanvas + (UI overlays in Phase 11)
 * - `full`: same plus title attract + leaderboard shells (Phase 12)
 *
 * Phase 4: composes Background + PlayCanvas + empty Scene; verifies that
 * scale-to-fit, parallax, and Flatland render-loop all initialize.
 */
export default function Driller({
  className,
  mode = 'hero',
  isVisible: _isVisible = true,
  zzfx: _zzfx,
  seed,
}: DrillerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [world] = useState(() => (typeof window !== 'undefined' ? getWorld() : null))
  const [shellState, setShellState] = useState<ShellState>(() => ({
    runState: mode === 'full' ? 'attract' : 'playing',
    gems: 0,
    depthM: 0,
    deepestM: 0,
    lives: 3,
  }))

  // Initialize seed + initial runState based on mode.
  useEffect(() => {
    if (!world) return
    world.set(GameState, {
      mode,
      runState: mode === 'full' ? 'attract' : 'playing',
    })
    if (seed !== undefined) {
      world.set(Seed, { value: seed })
    }
  }, [world, mode, seed])


  const handleRestart = useCallback(() => {
    if (!world) return
    world.set(GameState, {
      lives: 3,
      gems: 0,
      depthM: 0,
      deepestM: 0,
      runState: 'attract',
    })
    resetStreaming()
    world.set(Seed, { value: ((Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)) >>> 0 })
    const grid = world.get(Grid)
    if (grid) {
      grid.tiles.fill(0)
      grid.flags.fill(0)
      grid.frameIndex.fill(0)
    }
  }, [world])

  // Sync mode + canvas metrics into world singletons whenever they change.
  const onMetrics = useCallback(
    (m: PlayCanvasMetrics) => {
      if (!world) return
      world.set(Camera, {
        scale: m.scale,
        rows: Math.floor(m.canvasHeight / (m.scale * 16)),
      })
      world.set(GameState, { mode })
    },
    [world, mode],
  )

  // Pointer tracking: Game-level handlers translate DOM coords → world cell
  // → Pointer trait → resolved action; click commits.
  const metricsRef = useRef<PlayCanvasMetrics | null>(null)
  const onMetricsCombined = useCallback(
    (m: PlayCanvasMetrics) => {
      metricsRef.current = m
      onMetrics(m)
    },
    [onMetrics],
  )

  useEffect(() => {
    if (!world) return
    const host = hostRef.current
    if (!host) return

    const handleMove = (clientX: number, clientY: number) => {
      const m = metricsRef.current
      if (!m) return
      const cam = world.get(Camera)
      const grid = world.get(Grid)
      const rect = host.getBoundingClientRect()
      const canvasLeft = rect.left + (rect.width - m.canvasWidth) / 2
      const canvasTop = rect.top + (rect.height - m.canvasHeight) / 2
      const canvasX = clientX - canvasLeft
      const canvasY = clientY - canvasTop
      if (canvasX < 0 || canvasY < 0 || canvasX > m.canvasWidth || canvasY > m.canvasHeight) {
        const ptr = world.get(Pointer)
        if (ptr) ptr.hoverAction = 'none'
        return
      }
      const camY = cam?.y ?? 0
      const gridRows = grid?.rows ?? 256
      const cell = pointerWorldCell({
        canvasX,
        canvasY,
        canvasW: m.canvasWidth,
        canvasH: m.canvasHeight,
        scale: m.scale,
        cameraY: camY,
        cols: 18,
        rows: gridRows,
      })
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      world.set(Pointer, {
        px: clientX,
        py: clientY,
        hoverTargetCol: cell.col,
        hoverTargetRow: cell.row,
        hoverAction: action,
        hoverGemEntity: gemEntity ? (gemEntity as unknown as { id?: number }).id ?? 0 : 0,
      })
    }

    const handleClick = (clientX: number, clientY: number) => {
      handleMove(clientX, clientY)
      const ptr = world.get(Pointer)
      if (!ptr) return
      const cell = { col: ptr.hoverTargetCol, row: ptr.hoverTargetRow }
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      // Drag is a held primitive — pointerdown arms it; click commit is
      // a no-op so a stray release doesn't restart it. Everything else
      // commits as a one-shot tap.
      if (action === 'drag') return
      commitAction(world, action, gemEntity)
    }

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY)
    const onPointerDown = (e: PointerEvent) => {
      world.set(Pointer, { active: true })
      handleMove(e.clientX, e.clientY)
      const ptr = world.get(Pointer)
      if (!ptr) return
      // Lock the action mode for the duration of this press, so a
      // press-then-drag across cells can't silently flip modes
      // (e.g. paint → drag if the cursor crosses a falling chunk).
      world.set(Pointer, { lockedAction: ptr.hoverAction })
      if (ptr.hoverAction === 'paint') {
        // First paint commit fires on pointerdown so a single tap
        // still destroys a cell + charges a gem. Continuous paint
        // runs from pointerHeldTick.
        commitAction(world, 'paint', null)
      }
      if (ptr.hoverAction === 'drag') {
        startDrag(world, ptr.hoverTargetCol, ptr.hoverTargetRow)
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      // Releasing re-arms FLAG_FALLING on the dragged cluster so the
      // avalanche resumes from wherever the player left it. endDrag
      // is idempotent if no drag is active.
      const drag = world.get(Drag)
      const wasDragging = !!(drag && drag.clusterId !== 0)
      endDrag(world)
      world.set(Pointer, {
        active: false,
        dragEntity: 0,
        dragHeldSinceTick: 0,
        dragLastCostTick: 0,
        lockedAction: 'none',
      })
      // Skip the click-commit if this release ended a drag: the press
      // was dedicated to drag, and the cursor's resting cell shouldn't
      // suddenly trigger collect / pet / paint on release.
      if (!wasDragging) handleClick(e.clientX, e.clientY)
    }

    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointerup', onPointerUp)
    return () => {
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointerup', onPointerUp)
    }
  }, [world])

  if (!world) return null

  const showTitle = mode === 'full' && shellState.runState === 'attract'
  const showLeaderboard = mode === 'full' && shellState.runState === 'leaderboard'

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        // Solid host bg. The in-canvas biome-gradient layer handles
        // depth-fading color — no CSS gradient bleed-through.
        background: '#0a0608',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <WorldProvider world={world}>
        <Background />
        <PlayCanvas hostRef={hostRef} onMetrics={onMetricsCombined}>
          <Scene onShellStateChange={setShellState} />
        </PlayCanvas>
        <BiomeTransition />
        <DepthBar />
        <GemCounter />
        {mode === 'hero' && <HeroHint />}
        {showTitle && <TitleAttract topScores={loadLeaderboard().slice(0, 3)} />}
        {showLeaderboard && <Leaderboard onRestart={handleRestart} />}
      </WorldProvider>
    </div>
  )
}
