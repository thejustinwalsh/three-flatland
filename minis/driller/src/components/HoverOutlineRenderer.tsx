import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import {
  Drag,
  FLAG_FALLING,
  FLAG_SAGGING,
  FLAG_SHAKING,
  Gem,
  Grid,
  Pointer,
  SaggingChunk,
  TILE_STONE,
} from '../traits'
import { TILE_PX } from '../constants'

/**
 * Hover-target outline. Reads `Pointer.hoverAction` each frame and
 * draws a 1-pixel cell border around the cells the click would affect.
 * Color encodes the action type so the player learns the priority
 * visually:
 *
 *   collect → gold       (gem cell)
 *   pet     → pink       (driller's cell)
 *   drag    → sky        (all cluster cells in motion)
 *   brace   → orange     (all cells of the sagging chunk)
 *   paint   → red        (single cell under cursor)
 *   none    → invisible
 *
 * Single pool of `POOL_SIZE` outline sprites. Each frame: hide all,
 * then position + tint the first N for whichever target cells are
 * active. Pool sized to 64 covers a worst-case multi-cell chunk.
 */

const POOL_SIZE = 64

const TINT = {
  collect: '#fcd34d',
  drag: '#60a5fa',
  brace: '#fb923c',
  paint: '#ef4444',
} as const

interface Props {
  material: Sprite2DMaterial
}

export function HoverOutlineRenderer({ material }: Props) {
  const world = useWorld()
  const poolRefs = useRef<(Sprite2DType | null)[]>([])

  // Hide all sprites on mount.
  useEffect(() => {
    for (const s of poolRefs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const ptr = world.get(Pointer)
    const pool = poolRefs.current
    let used = 0

    // Time-modulated pulse for the gem outline so the player notices
    // it (subtle 1-px borders on small gems can be invisible). Cycles
    // ~1.6Hz, amplitude ~25% over base scale.
    const now = Date.now()
    const place = (col: number, row: number, tintHex: string, pulse = false) => {
      const sprite = pool[used++]
      if (!sprite) return
      const s = pulse ? TILE_PX * (1 + 0.25 * (0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 3.2))) : TILE_PX
      sprite.position.set(col * TILE_PX + TILE_PX / 2, -(row * TILE_PX + TILE_PX / 2), 0)
      sprite.scale.set(s, s, 1)
      sprite.tint.r = parseInt(tintHex.slice(1, 3), 16) / 255
      sprite.tint.g = parseInt(tintHex.slice(3, 5), 16) / 255
      sprite.tint.b = parseInt(tintHex.slice(5, 7), 16) / 255
    }

    if (ptr) {
      const action = ptr.hoverAction
      switch (action) {
        case 'collect': {
          // Pulse the gem's outline so small gems still feel grabable.
          // Halo collects target the gem's EXACT cell (not the hover
          // cell), so the player sees which gem the click will hit.
          let found = false
          world.query(Gem).forEach((entity) => {
            if (found) return
            const g = entity.get(Gem)
            if (!g || g.collected) return
            const dc = Math.abs(g.col - ptr.hoverTargetCol)
            const dr = Math.abs(g.row - ptr.hoverTargetRow)
            if (Math.max(dc, dr) > 1) return
            place(g.col, g.row, TINT.collect, true)
            found = true
          })
          if (!found) place(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.collect, true)
          break
        }
        // Pet: no selection box on the driller — the mood bubble that
        // spawns on pet is the feedback. Outlining the driller cell
        // would be redundant + ugly.
        case 'drag': {
          // Outline every cluster cell in motion. If a drag is already
          // active, use Drag.clusterId; else use the clusterId at the
          // hover cell (the chunk we're ABOUT to grab).
          const grid = world.get(Grid)
          const drag = world.get(Drag)
          if (grid) {
            const targetCid =
              drag && drag.clusterId !== 0
                ? drag.clusterId
                : grid.clusterId[ptr.hoverTargetRow * grid.cols + ptr.hoverTargetCol] ?? 0
            if (targetCid !== 0) {
              for (let i = 0; i < grid.clusterId.length && used < POOL_SIZE; i++) {
                if (grid.clusterId[i] !== targetCid) continue
                if (grid.tiles[i] !== TILE_STONE) continue
                const f = grid.flags[i] ?? 0
                if ((f & (FLAG_SHAKING | FLAG_FALLING)) === 0) continue
                const c = i % grid.cols
                const r = Math.floor(i / grid.cols)
                place(c, r, TINT.drag)
              }
            } else {
              // Falling soil chunk (SaggingChunk entity) — outline its cells.
              world.query(SaggingChunk).forEach((entity) => {
                if (used > 0) return
                const sag = entity.get(SaggingChunk)
                if (!sag) return
                const containsHover = sag.cells.some(
                  (c) => c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow,
                )
                if (!containsHover) return
                for (const c of sag.cells) {
                  if (used >= POOL_SIZE) break
                  place(c.col, c.row, TINT.drag)
                }
              })
              if (used === 0) place(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.drag)
            }
          }
          break
        }
        case 'brace': {
          // Outline every cell of the sagging chunk under the cursor.
          world.query(SaggingChunk).forEach((entity) => {
            if (used > 0) return
            const sag = entity.get(SaggingChunk)
            if (!sag) return
            const containsHover = sag.cells.some(
              (c) => c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow,
            )
            if (!containsHover) return
            for (const c of sag.cells) {
              if (used >= POOL_SIZE) break
              place(c.col, c.row, TINT.brace)
            }
          })
          if (used === 0) {
            // Fallback: at least outline the hovered cell.
            const grid = world.get(Grid)
            if (grid) {
              const idx = ptr.hoverTargetRow * grid.cols + ptr.hoverTargetCol
              if ((grid.flags[idx] ?? 0) & FLAG_SAGGING) {
                place(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.brace)
              }
            }
          }
          break
        }
        case 'paint': {
          place(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.paint)
          break
        }
        default:
          break
      }
    }

    // Hide unused sprites.
    for (let i = used; i < POOL_SIZE; i++) {
      const s = pool[i]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <sprite2D
          key={i}
          ref={(el) => {
            poolRefs.current[i] = el
          }}
          material={material}
          tint="#ffffff"
          position={[-9999, -9999, 0]}
          scale={[0, 0, 1]}
          renderOrder={100}
        />
      ))}
    </>
  )
}
