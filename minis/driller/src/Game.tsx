import { useCallback, useEffect, useRef, useState } from 'react'
import { WorldProvider } from 'koota/react'
import { getWorld } from './world'
import { Camera, GameState, Pointer } from './traits'
import { PlayCanvas } from './components/PlayCanvas'
import { Background } from './components/Background'
import { Scene } from './components/Scene'
import { HoverCursor } from './components/HoverCursor'
import { commitAction, pointerWorldCell, resolveHoverAction } from './systems/input'
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
  seed: _seed,
}: DrillerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [world] = useState(() => (typeof window !== 'undefined' ? getWorld() : null))

  // Sync mode + canvas metrics into world singletons whenever they change.
  const onMetrics = useCallback(
    (m: PlayCanvasMetrics) => {
      if (!world) return
      const cam = world.get(Camera)
      if (cam) {
        cam.scale = m.scale
        cam.rows = Math.floor(m.canvasHeight / (m.scale * 16))
      }
      const gs = world.get(GameState)
      if (gs) gs.mode = mode
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
      const grid = world.get(Pointer) // ptr ref read
      const grid2 = world.get(Camera)
      void grid
      void grid2
      // Compute canvas-relative coords (the canvas is centered horizontally)
      const rect = host.getBoundingClientRect()
      const canvasLeft = rect.left + (rect.width - m.canvasWidth) / 2
      const canvasTop = rect.top
      const canvasX = clientX - canvasLeft
      const canvasY = clientY - canvasTop
      if (canvasX < 0 || canvasY < 0 || canvasX > m.canvasWidth || canvasY > m.canvasHeight) {
        const ptr = world.get(Pointer)
        if (ptr) ptr.hoverAction = 'none'
        return
      }
      const camY = cam?.y ?? 0
      const cell = pointerWorldCell({
        canvasX,
        canvasY,
        canvasW: m.canvasWidth,
        canvasH: m.canvasHeight,
        scale: m.scale,
        cameraY: camY,
        cols: 18,
        rows: world.get(Camera)?.rows ?? 22,
      })
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      const ptr = world.get(Pointer)
      if (ptr) {
        ptr.px = clientX
        ptr.py = clientY
        ptr.hoverTargetCol = cell.col
        ptr.hoverTargetRow = cell.row
        ptr.hoverAction = action
        ptr.hoverGemEntity = gemEntity ? (gemEntity as unknown as { id?: number }).id ?? 0 : 0
      }
    }

    const handleClick = (clientX: number, clientY: number) => {
      handleMove(clientX, clientY)
      const ptr = world.get(Pointer)
      if (!ptr) return
      // Re-resolve to get the gem entity reference (Pointer only stores its id).
      const cell = { col: ptr.hoverTargetCol, row: ptr.hoverTargetRow }
      const { action, gemEntity } = resolveHoverAction(world, cell.col, cell.row)
      commitAction(world, action, gemEntity)
    }

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY)
    const onPointerDown = (e: PointerEvent) => {
      const ptr = world.get(Pointer)
      if (ptr) ptr.active = true
      handleMove(e.clientX, e.clientY)
    }
    const onPointerUp = (e: PointerEvent) => {
      const ptr = world.get(Pointer)
      if (ptr) ptr.active = false
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

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a0a14',
        overflow: 'hidden',
        cursor: 'none',
        touchAction: 'none',
      }}
    >
      <WorldProvider world={world}>
        <Background />
        <PlayCanvas hostRef={hostRef} onMetrics={onMetricsCombined}>
          <Scene />
        </PlayCanvas>
        <HoverCursor />
      </WorldProvider>
    </div>
  )
}
