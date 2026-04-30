import { useEffect, useMemo, useRef, useState } from 'react'
import { useMergeState } from './mergeStore'

const ARTBOARD_GAP = 32
const MIN_ZOOM = 0.05
const MAX_ZOOM = 16

type Layout = {
  x: number
  y: number
  w: number
  h: number
  src: ReturnType<typeof useMergeState>['sources'][number]
}

function layoutArtboards(sources: ReturnType<typeof useMergeState>['sources']): {
  boards: Layout[]
  total: { w: number; h: number }
} {
  if (sources.length === 0) return { boards: [], total: { w: 0, h: 0 } }
  const widths = sources.map((s) => s.json.meta.size.w)
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length
  const wrapWidth = Math.max(avg * 2, ...widths)
  const boards: Layout[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const src of sources) {
    const w = src.json.meta.size.w
    const h = src.json.meta.size.h
    if (x + w > wrapWidth && x > 0) {
      x = 0
      y += rowH + ARTBOARD_GAP
      rowH = 0
    }
    boards.push({ x, y, w, h, src })
    x += w + ARTBOARD_GAP
    rowH = Math.max(rowH, h)
  }
  const total = {
    w: Math.max(...boards.map((b) => b.x + b.w)),
    h: Math.max(...boards.map((b) => b.y + b.h)),
  }
  return { boards, total }
}

export function SourcesView() {
  const { sources, result } = useMergeState()
  const { boards, total } = useMemo(() => layoutArtboards(sources), [sources])

  // Pan/zoom state. viewBox is computed as `${x} ${y} ${w} ${h}` where
  // w/h shrink as zoom increases. Initial fit centers the entire layout
  // with a small margin and picks a zoom that fills the container.
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; basePanX: number; basePanY: number } | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })

  // Track container resize so zoom/pan math stays correct.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setContainerSize({ w: rect.width, h: rect.height })
    })
    ro.observe(el)
    const rect = el.getBoundingClientRect()
    setContainerSize({ w: rect.width, h: rect.height })
    return () => ro.disconnect()
  }, [])

  // Initial fit: pick a zoom that frames the whole layout with 10% margin,
  // then center the layout in the container.
  useEffect(() => {
    if (total.w === 0 || total.h === 0 || containerSize.w === 0) return
    const fitZoom = Math.min(containerSize.w / (total.w * 1.1), containerSize.h / (total.h * 1.1))
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom))
    setZoom(clamped)
    setPan({ x: total.w / 2, y: total.h / 2 })
  }, [total.w, total.h, containerSize.w, containerSize.h])

  // Frame conflict identity = `${sourceUri}::${originalFrameName}`
  const conflictSet = useMemo(() => {
    const s = new Set<string>()
    if (result.kind === 'conflicts') {
      for (const c of result.frameConflicts) {
        for (const owner of c.sources) s.add(`${owner.uri}::${owner.originalName}`)
      }
    }
    return s
  }, [result])

  const visibleW = containerSize.w / zoom
  const visibleH = containerSize.h / zoom
  const viewBox = `${pan.x - visibleW / 2} ${pan.y - visibleH / 2} ${visibleW} ${visibleH}`

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * 0.001)
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    setZoom(next)
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      basePanX: pan.x,
      basePanY: pan.y,
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    setPan({ x: drag.basePanX - dx, y: drag.basePanY - dy })
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
  }

  if (boards.length === 0) {
    return <div style={{ padding: 12 }}>No sources loaded.</div>
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: dragRef.current ? 'grabbing' : 'grab' }}
    >
      <svg
        viewBox={viewBox}
        width={containerSize.w}
        height={containerSize.h}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ display: 'block', background: 'var(--vscode-editor-background)', userSelect: 'none' }}
      >
        {boards.map((b) => (
          <g key={b.src.uri} transform={`translate(${b.x} ${b.y})`}>
            <rect
              x={-1}
              y={-1}
              width={b.w + 2}
              height={b.h + 2}
              fill="none"
              stroke="var(--vscode-panel-border)"
              strokeWidth={1 / zoom}
            />
            <image
              href={b.src.imageUri}
              x={0}
              y={0}
              width={b.w}
              height={b.h}
              preserveAspectRatio="none"
              style={{ imageRendering: 'pixelated' }}
            />
            {Object.entries(b.src.json.frames).map(([name, f]) => {
              const isConflict = conflictSet.has(`${b.src.uri}::${name}`)
              return (
                <rect
                  key={name}
                  x={f.frame.x}
                  y={f.frame.y}
                  width={f.frame.w}
                  height={f.frame.h}
                  fill="none"
                  stroke={
                    isConflict
                      ? 'var(--vscode-editorError-foreground)'
                      : 'var(--vscode-focusBorder)'
                  }
                  strokeWidth={(isConflict ? 2 : 1) / zoom}
                />
              )
            })}
            <text
              x={0}
              y={-8}
              fill="var(--vscode-foreground)"
              fontSize={12 / zoom}
              style={{ fontFamily: 'var(--vscode-font-family)' }}
            >
              {b.src.alias} — {Object.keys(b.src.json.frames).length} frames
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
