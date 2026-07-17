import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { WorldProvider } from 'koota/react'
import { getWorld } from './world'
import { Camera, Drag, GameState, Grid, Pointer } from './traits'
import { PlayCanvas } from './components/PlayCanvas'
import { Background } from './components/Background'
import { BiomeTransition } from './components/BiomeTransition'
import { Scene, type ShellState } from './components/Scene'
import { DepthBar } from './components/DepthBar'
import { GemCounter } from './components/GemCounter'
import { HeroHint } from './components/HeroHint'
import { TitleAttract } from './components/TitleAttract'
import { Leaderboard, loadLeaderboard } from './components/Leaderboard'
import { commitAction, pointerWorldCell, resolveHoverAction } from './systems/input'
import { endDrag, startDrag } from './systems/drag'
import { vacuumFreeFallGemSweep } from './systems/gem-vacuum'
import { bindSoundPlayer, createSoundPlayer } from './systems/sounds'
import { resetRun } from './systems/run-lifecycle'
import type { DrillerProps } from './types'
import type { PlayCanvasMetrics } from './lib/scale'

/** Driller mini-game root for hero and full-run modes. */
export default function Driller({
  className,
  mode = 'hero',
  isVisible: _isVisible = true,
  zzfx,
  seed,
}: DrillerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [world] = useState(() => {
    if (typeof window === 'undefined') return null
    return getWorld(seed === undefined ? { mode } : { mode, seed })
  })
  const [shellState, setShellState] = useState<ShellState>(() => ({
    runState: mode === 'full' ? 'attract' : 'playing',
    gems: 0,
    depthM: 0,
    deepestM: 0,
    lives: 3,
  }))

  useEffect(() => {
    if (!world || !zzfx) return
    return bindSoundPlayer(world, createSoundPlayer(zzfx))
  }, [world, zzfx])

  const handleRestart = () => {
    if (!world) return
    resetRun(world, {
      seed: ((Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)) >>> 0,
    })
  }

  // Sync mode + canvas metrics into world singletons whenever they change.
  const [metrics, setMetrics] = useState<PlayCanvasMetrics | null>(null)
  const onMetrics = (m: PlayCanvasMetrics) => {
    if (!world) return
    setMetrics(m)
    world.set(Camera, {
      scale: m.scale,
      rows: Math.floor(m.canvasHeight / (m.scale * 16)),
    })
    world.set(GameState, { mode })
  }

  // Pointer tracking: Game-level handlers translate DOM coords → world cell
  // → Pointer trait → resolved action; click commits.
  const handleMove = useEffectEvent((clientX: number, clientY: number) => {
    if (!world || !metrics) return
    const cam = world.get(Camera)
    const grid = world.get(Grid)
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const canvasLeft = rect.left + (rect.width - metrics.canvasWidth) / 2
    const canvasTop = rect.top + (rect.height - metrics.canvasHeight) / 2
    const canvasX = clientX - canvasLeft
    const canvasY = clientY - canvasTop
    if (
      canvasX < 0 ||
      canvasY < 0 ||
      canvasX > metrics.canvasWidth ||
      canvasY > metrics.canvasHeight
    ) {
      const ptr = world.get(Pointer)
      if (ptr) ptr.hoverAction = 'none'
      return
    }
    const cell = pointerWorldCell({
      canvasX,
      canvasY,
      canvasW: metrics.canvasWidth,
      canvasH: metrics.canvasHeight,
      scale: metrics.scale,
      cameraY: cam?.y ?? 0,
      cols: 18,
      rows: grid?.rows ?? 256,
    })
    const worldPoint = {
      x: canvasX / metrics.scale,
      y: (cam?.y ?? 0) + canvasY / metrics.scale,
    }
    const previousPointer = world.get(Pointer)
    const wasActive = previousPointer?.active ?? false
    const hadVacuumPoint = previousPointer?.vacuumHasPoint ?? false
    const previousWorldPoint = {
      x: previousPointer?.worldPx ?? worldPoint.x,
      y: previousPointer?.worldPy ?? worldPoint.y,
    }
    const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
    world.set(Pointer, {
      px: clientX,
      py: clientY,
      worldPx: worldPoint.x,
      worldPy: worldPoint.y,
      hoverTargetCol: cell.col,
      hoverTargetRow: cell.row,
      hoverAction: action,
      hoverGemEntity: gemEntity?.id() ?? 0,
    })
    if (wasActive) {
      vacuumFreeFallGemSweep(world, hadVacuumPoint ? previousWorldPoint : worldPoint, worldPoint)
      world.set(Pointer, { vacuumHasPoint: true })
    }
  })

  const handleClick = useEffectEvent((clientX: number, clientY: number) => {
    if (!world) return
    handleMove(clientX, clientY)
    const ptr = world.get(Pointer)
    if (!ptr) return
    const cell = { col: ptr.hoverTargetCol, row: ptr.hoverTargetRow }
    const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
    if (action !== 'drag') commitAction(world, action, gemEntity)
  })

  useEffect(() => {
    if (!world) return
    const host = hostRef.current
    if (!host) return

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY)
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault()
      host.setPointerCapture(e.pointerId)
      world.set(Pointer, { active: true, vacuumHasPoint: false })
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
        vacuumHasPoint: false,
        dragEntity: 0,
        dragHeldSinceTick: 0,
        dragLastCostTick: 0,
        lockedAction: 'none',
      })
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
      // Skip the click-commit if this release ended a drag: the press
      // was dedicated to drag, and the cursor's resting cell shouldn't
      // suddenly trigger collect / pet / paint on release.
      if (!wasDragging) handleClick(e.clientX, e.clientY)
    }
    const onPointerCancel = (e: PointerEvent) => {
      endDrag(world)
      world.set(Pointer, {
        active: false,
        vacuumHasPoint: false,
        dragEntity: 0,
        dragHeldSinceTick: 0,
        dragLastCostTick: 0,
        lockedAction: 'none',
      })
      if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
    }

    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('pointercancel', onPointerCancel)
    return () => {
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointercancel', onPointerCancel)
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
        <PlayCanvas hostRef={hostRef} onMetrics={onMetrics}>
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
