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
 * draws a colored marker around the cells the click would affect:
 *
 *   collect → gold pulsing hollow-square around the gem cell
 *   drag    → sky perimeter line around the cluster's outer edge
 *   brace   → orange perimeter line around the SaggingChunk
 *   paint   → red hollow-square on the hover cell
 *   none    → invisible
 *
 * Two pools:
 *   - `outlinePool` (32) — hollow 16×16 squares for single-cell
 *     outlines (collect/paint), using the hollow-square outline
 *     material.
 *   - `edgePool` (256) — solid line segments for cluster perimeters,
 *     using the solid white material (driller material). Each
 *     cluster cell contributes 0–4 edges; only edges that face a
 *     non-cluster cell are drawn → the result is a continuous
 *     outline of the cluster shape, not a grid of per-cell boxes.
 */

const OUTLINE_POOL = 32
const EDGE_POOL = 256
const EDGE_THICKNESS = 2 // px

const TINT = {
  collect: '#fcd34d',
  drag: '#60a5fa',
  brace: '#fb923c',
  paint: '#ef4444',
} as const

interface Props {
  outlineMaterial: Sprite2DMaterial
  fillMaterial: Sprite2DMaterial
}

function setTintHex(sprite: Sprite2DType, hex: string): void {
  sprite.tint.r = parseInt(hex.slice(1, 3), 16) / 255
  sprite.tint.g = parseInt(hex.slice(3, 5), 16) / 255
  sprite.tint.b = parseInt(hex.slice(5, 7), 16) / 255
}

export function HoverOutlineRenderer({ outlineMaterial, fillMaterial }: Props) {
  void outlineMaterial // bound to JSX below
  void fillMaterial
  const world = useWorld()
  const outlineRefs = useRef<(Sprite2DType | null)[]>([])
  const edgeRefs = useRef<(Sprite2DType | null)[]>([])

  useEffect(() => {
    for (const s of outlineRefs.current) if (s) s.scale.set(0, 0, 1)
    for (const s of edgeRefs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const ptr = world.get(Pointer)
    let outlineUsed = 0
    let edgeUsed = 0

    // Single-cell hollow-square outline (pulse optional).
    const now = Date.now()
    const placeOutline = (col: number, row: number, tintHex: string, pulse = false) => {
      const sprite = outlineRefs.current[outlineUsed++]
      if (!sprite) return
      const s = pulse
        ? TILE_PX * (1 + 0.25 * (0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 3.2)))
        : TILE_PX
      sprite.position.set(col * TILE_PX + TILE_PX / 2, -(row * TILE_PX + TILE_PX / 2), 0)
      sprite.scale.set(s, s, 1)
      setTintHex(sprite, tintHex)
    }

    // Single edge segment — px-thick line on one side of a cell.
    const placeEdge = (px: number, py: number, w: number, h: number, tintHex: string) => {
      const sprite = edgeRefs.current[edgeUsed++]
      if (!sprite) return
      sprite.position.set(px, py, 0)
      sprite.scale.set(w, h, 1)
      setTintHex(sprite, tintHex)
    }

    // For a set of cells (col, row), draw only edges that border a
    // non-set neighbor. Produces a clean perimeter outline of the
    // arbitrary shape instead of a grid of per-cell boxes.
    const placePerimeter = (
      cells: Iterable<{ col: number; row: number }>,
      tintHex: string,
    ) => {
      const set = new Set<string>()
      for (const c of cells) set.add(`${c.col},${c.row}`)
      const inSet = (col: number, row: number) => set.has(`${col},${row}`)
      for (const key of set) {
        const [cs, rs] = key.split(',') as [string, string]
        const c = { col: Number(cs), row: Number(rs) }
        const cx = c.col * TILE_PX + TILE_PX / 2
        const cy = -(c.row * TILE_PX + TILE_PX / 2)
        // Top edge
        if (!inSet(c.col, c.row - 1)) {
          placeEdge(cx, cy + TILE_PX / 2 - EDGE_THICKNESS / 2, TILE_PX, EDGE_THICKNESS, tintHex)
        }
        // Bottom edge
        if (!inSet(c.col, c.row + 1)) {
          placeEdge(cx, cy - TILE_PX / 2 + EDGE_THICKNESS / 2, TILE_PX, EDGE_THICKNESS, tintHex)
        }
        // Left edge
        if (!inSet(c.col - 1, c.row)) {
          placeEdge(cx - TILE_PX / 2 + EDGE_THICKNESS / 2, cy, EDGE_THICKNESS, TILE_PX, tintHex)
        }
        // Right edge
        if (!inSet(c.col + 1, c.row)) {
          placeEdge(cx + TILE_PX / 2 - EDGE_THICKNESS / 2, cy, EDGE_THICKNESS, TILE_PX, tintHex)
        }
      }
    }

    if (ptr) {
      const action = ptr.hoverAction
      switch (action) {
        case 'collect': {
          let found = false
          world.query(Gem).forEach((entity) => {
            if (found) return
            const g = entity.get(Gem)
            if (!g || g.collected) return
            const dc = Math.abs(g.col - ptr.hoverTargetCol)
            const dr = Math.abs(g.row - ptr.hoverTargetRow)
            if (Math.max(dc, dr) > 1) return
            placeOutline(g.col, g.row, TINT.collect, true)
            found = true
          })
          if (!found) placeOutline(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.collect, true)
          break
        }
        // Pet: no outline (mood bubble is the feedback).
        case 'drag': {
          const grid = world.get(Grid)
          const drag = world.get(Drag)
          if (grid) {
            const targetCid =
              drag && drag.clusterId !== 0
                ? drag.clusterId
                : grid.clusterId[ptr.hoverTargetRow * grid.cols + ptr.hoverTargetCol] ?? 0
            if (targetCid !== 0) {
              const cells: { col: number; row: number }[] = []
              for (let i = 0; i < grid.clusterId.length; i++) {
                if (grid.clusterId[i] !== targetCid) continue
                if (grid.tiles[i] !== TILE_STONE) continue
                const f = grid.flags[i] ?? 0
                if ((f & (FLAG_SHAKING | FLAG_FALLING)) === 0) continue
                cells.push({ col: i % grid.cols, row: Math.floor(i / grid.cols) })
              }
              if (cells.length > 0) placePerimeter(cells, TINT.drag)
            } else {
              // Soil-chunk SaggingChunk perimeter.
              world.query(SaggingChunk).forEach((entity) => {
                if (edgeUsed > 0) return
                const sag = entity.get(SaggingChunk)
                if (!sag) return
                const containsHover = sag.cells.some(
                  (c) => c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow,
                )
                if (!containsHover) return
                placePerimeter(sag.cells, TINT.drag)
              })
              if (edgeUsed === 0) {
                placeOutline(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.drag)
              }
            }
          }
          break
        }
        case 'brace': {
          world.query(SaggingChunk).forEach((entity) => {
            if (edgeUsed > 0) return
            const sag = entity.get(SaggingChunk)
            if (!sag) return
            const containsHover = sag.cells.some(
              (c) => c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow,
            )
            if (!containsHover) return
            placePerimeter(sag.cells, TINT.brace)
          })
          if (edgeUsed === 0) {
            const grid = world.get(Grid)
            if (grid) {
              const idx = ptr.hoverTargetRow * grid.cols + ptr.hoverTargetCol
              if ((grid.flags[idx] ?? 0) & FLAG_SAGGING) {
                placeOutline(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.brace)
              }
            }
          }
          break
        }
        case 'paint': {
          placeOutline(ptr.hoverTargetCol, ptr.hoverTargetRow, TINT.paint)
          break
        }
        default:
          break
      }
    }

    for (let i = outlineUsed; i < OUTLINE_POOL; i++) {
      const s = outlineRefs.current[i]
      if (s) s.scale.set(0, 0, 1)
    }
    for (let i = edgeUsed; i < EDGE_POOL; i++) {
      const s = edgeRefs.current[i]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  return (
    <>
      {Array.from({ length: OUTLINE_POOL }).map((_, i) => (
        <sprite2D
          key={`o${i}`}
          ref={(el) => {
            outlineRefs.current[i] = el
          }}
          material={outlineMaterial}
          tint="#ffffff"
          position={[-9999, -9999, 0]}
          scale={[0, 0, 1]}
          renderOrder={100}
        />
      ))}
      {Array.from({ length: EDGE_POOL }).map((_, i) => (
        <sprite2D
          key={`e${i}`}
          ref={(el) => {
            edgeRefs.current[i] = el
          }}
          material={fillMaterial}
          tint="#ffffff"
          position={[-9999, -9999, 0]}
          scale={[0, 0, 1]}
          renderOrder={101}
        />
      ))}
    </>
  )
}
