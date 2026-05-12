import { useCallback, useEffect, useRef, useState } from 'react'
import { WorldProvider } from 'koota/react'
import { getWorld } from './world'
import { Camera, GameState, Grid, Pointer, Seed } from './traits'
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
import { WIGGLE_THRESHOLD_PX } from './constants'
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

    // Wiggle / drag tracking — held in refs so we don't blow re-renders
    // for every pointer event. Both are tied to a specific cell; if the
    // hover cell changes mid-interaction the session resets.
    const wiggleRef = { lastX: 0, lastY: 0, primed: false }

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
      const ptrPrev = world.get(Pointer)
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      world.set(Pointer, {
        px: clientX,
        py: clientY,
        hoverTargetCol: cell.col,
        hoverTargetRow: cell.row,
        hoverAction: action,
        hoverGemEntity: gemEntity ? (gemEntity as unknown as { id?: number }).id ?? 0 : 0,
      })

      // Wiggle: while the button is held over a stable rock, accumulate
      // raw pointer-pixel travel until WIGGLE_THRESHOLD_PX. When crossed,
      // commit the shake. If the hover cell changes mid-wiggle, reset.
      if (ptrPrev?.active && wiggleRef.primed && ptrPrev.wiggleCol === cell.col && ptrPrev.wiggleRow === cell.row) {
        const dx = clientX - wiggleRef.lastX
        const dy = clientY - wiggleRef.lastY
        const dist = Math.hypot(dx, dy)
        const next = ptrPrev.wiggleDistance + dist
        wiggleRef.lastX = clientX
        wiggleRef.lastY = clientY
        if (next >= WIGGLE_THRESHOLD_PX) {
          commitAction(world, 'shake', null)
          world.set(Pointer, { wiggleCol: -1, wiggleRow: -1, wiggleDistance: 0 })
          wiggleRef.primed = false
        } else {
          world.set(Pointer, { wiggleDistance: next })
        }
      } else if (ptrPrev?.active && wiggleRef.primed) {
        // Hover cell changed → cancel the wiggle.
        world.set(Pointer, { wiggleCol: -1, wiggleRow: -1, wiggleDistance: 0 })
        wiggleRef.primed = false
      }
    }

    const handleClick = (clientX: number, clientY: number) => {
      handleMove(clientX, clientY)
      const ptr = world.get(Pointer)
      if (!ptr) return
      const cell = { col: ptr.hoverTargetCol, row: ptr.hoverTargetRow }
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      // Single-click commits everything EXCEPT shake (which is gated by
      // the wiggle gesture) and drag (held primitive, no click-commit).
      // Paint is one-shot per pointerdown here; the held-paint loop is
      // driven by the per-frame paint tick below.
      if (action === 'shake' || action === 'drag') return
      commitAction(world, action, gemEntity)
    }

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY)
    const onPointerDown = (e: PointerEvent) => {
      world.set(Pointer, { active: true })
      handleMove(e.clientX, e.clientY)
      const ptr = world.get(Pointer)
      if (!ptr) return
      // Prime wiggle on stable rocks; first move-delta starts accumulating.
      if (ptr.hoverAction === 'shake') {
        world.set(Pointer, {
          wiggleCol: ptr.hoverTargetCol,
          wiggleRow: ptr.hoverTargetRow,
          wiggleDistance: 0,
        })
        wiggleRef.lastX = e.clientX
        wiggleRef.lastY = e.clientY
        wiggleRef.primed = true
      }
      // First paint commit fires on pointerdown so a single tap still
      // costs a gem + bumps the cell. Continuous paint runs from
      // pointerPaintTick (driven by drillerSystem each tick).
      if (ptr.hoverAction === 'paint') {
        commitAction(world, 'paint', null)
      }
      // Drag pickup: when pointer goes down on a SHAKING/FALLING cell,
      // arm Pointer.dragEntity. Per-tick drag-cost + chunk translation
      // is driven by the pointer drag tick system (added in phase 5).
      if (ptr.hoverAction === 'drag') {
        const gs = world.get(GameState)
        if (gs) {
          world.set(Pointer, {
            dragEntity: -1, // sentinel: grid-cell drag (no entity), col/row in hoverTarget
            dragHeldSinceTick: gs.tick,
            dragLastCostTick: gs.tick,
          })
        }
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      world.set(Pointer, {
        active: false,
        wiggleCol: -1,
        wiggleRow: -1,
        wiggleDistance: 0,
        dragEntity: 0,
        dragHeldSinceTick: 0,
        dragLastCostTick: 0,
      })
      wiggleRef.primed = false
      handleClick(e.clientX, e.clientY)
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
