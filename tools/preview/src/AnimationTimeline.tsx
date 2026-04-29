import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'
import type { AnimationDrawerDensity } from './AnimationDrawer'
import { useDragTarget, useOptionalDrag } from './dragKit'

export type AnimationTimelineProps = {
  /** Frame names in playback order, with duplicates encoding hold counts. */
  frames: readonly string[]
  /**
   * All atlas rects, indexed by name for thumbnail lookup. The timeline
   * doesn't own rect identity; it just needs the rect geometry to draw
   * the sprite-sheet thumbnail.
   */
  rectsByName: Record<string, Rect>
  atlasImageUri: string | null
  atlasSize: { w: number; h: number } | null
  density: AnimationDrawerDensity
  /** Current playhead index (group index — see `groupCells`). */
  playheadGroupIndex: number
  /**
   * Current playhead frame index (post-duplication). Drives the
   * vertical playhead-line overlay so the line moves through the
   * sub-frames of a held group, not just the group boundaries.
   * When paused (or when `getSmoothPlayhead` isn't provided) the
   * line snaps to this integer position.
   */
  playhead: number
  /** Set true when the App's rAF loop is actively advancing the store. */
  isPlaying?: boolean
  /**
   * Optional sub-frame getter. When provided AND `isPlaying`, the
   * line drives off this every rAF for smooth interpolation between
   * integer frame positions. Caller should supply the playback
   * store's `getSmoothPlayhead` directly.
   */
  getSmoothPlayhead?: () => number
  /** Click a cell to scrub the playhead there. */
  onSeekGroup(groupIndex: number): void
  /**
   * Click on empty timeline space (not a cell) — clears any active
   * cell-highlight state in the App. Wired to the
   * AnimationRectHighlight overlay so the user can dismiss the
   * focused-frame chrome without leaving the timeline.
   */
  onClearHighlight?(): void
  /** Called with the new hold count for a group (Task 8). */
  onChangeHold?(groupIndex: number, nextCount: number): void
  /**
   * Called when one or more frames are dropped onto the timeline.
   * `insertIndex` is the position in the post-duplication frame
   * array; v1 always appends at the end. `frameNames` carries the
   * dragged set (one entry for a single drag, multiple for a
   * multi-selection drag) — caller appends them in order.
   */
  onDropFrames?(insertIndex: number, frameNames: readonly string[]): void
}

/**
 * A "group" is one or more consecutive identical frame names — that's a
 * "cell with a hold count" in the UI. Returns groups paired with their
 * starting index in the underlying frames array, useful for events and
 * reorders.
 */
export function groupCells(frames: readonly string[]): { name: string; count: number; startIndex: number }[] {
  const out: { name: string; count: number; startIndex: number }[] = []
  let i = 0
  while (i < frames.length) {
    const name = frames[i]!
    let j = i
    while (j < frames.length && frames[j] === name) j++
    out.push({ name, count: j - i, startIndex: i })
    i = j
  }
  return out
}

/**
 * Map a fractional or integer post-duplication playhead to a pixel
 * offset inside the detail track. Each cell is `count * CELL_BASE`
 * inner content + 2px L/R border, separated by TRACK_GAP. Within
 * the active cell, the offset advances by CELL_BASE per (fractional)
 * sub-frame.
 */
function playheadFrameToPx(
  frameIndex: number,
  groups: readonly { name: string; count: number; startIndex: number }[],
): number {
  let x = 0
  let consumed = 0
  for (const g of groups) {
    if (consumed + g.count > frameIndex) {
      // playhead is inside this group — skip the cell's left border
      // and walk into it by (frameIndex - consumed) cells.
      return x + 1 + (frameIndex - consumed) * CELL_BASE
    }
    x += g.count * CELL_BASE + 2 + TRACK_GAP
    consumed += g.count
  }
  // Past the last cell — clamp to its right edge.
  return x
}

/** Map a playhead frame index (post-duplication) to the owning group index. */
export function frameIndexToGroupIndex(frames: readonly string[], frameIndex: number): number {
  if (frames.length === 0) return 0
  let i = 0
  let group = 0
  while (i < frames.length && i <= frameIndex) {
    const name = frames[i]!
    while (i < frames.length && frames[i] === name) i++
    if (i > frameIndex) return group
    group++
  }
  return Math.max(0, group - 1)
}

const CELL_BASE = 40
// Each held duplicate adds a full cell's width — so ×3 visually
// occupies 3 cells worth of space, matching the user's mental
// model of "one cell == one frame".
const CELL_HOLD_PER_DUP = CELL_BASE
const TRACK_GAP = 2

const s = stylex.create({
  trackDetail: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '2px',
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative',
  },
  trackDots: {
    display: 'flex',
    alignItems: 'center',
    gap: space.xs,
    height: '100%',
    paddingInline: space.sm,
    overflowX: 'auto',
    position: 'relative',
  },
  cell: {
    boxSizing: 'border-box',
    height: CELL_BASE,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    backgroundColor: vscode.bg,
    position: 'relative',
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '8px',
    flexShrink: 0,
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
  },
  // Inner sprite tile — one of these per held duplicate. Width =
  // CELL_BASE; the cell's inner content area is exactly CELL_BASE *
  // count wide (we add the cell's 1px L+R border to the cell's
  // declared width so the inner area matches), so the tiles fill the
  // cell with no slack and the last tile is the same width as the
  // rest. Sprite is centered inside each tile via background-position
  // so a ×6 hold reads as 6 visible thumbnails of the same frame.
  cellTile: {
    width: CELL_BASE,
    height: '100%',
    backgroundRepeat: 'no-repeat',
    flexShrink: 0,
  },
  // Playhead cell: pink border, same as the playhead line and the
  // canvas active-frame overlay. Three pieces of chrome (cell +
  // line + canvas) all read as one cue: "this is the active frame".
  cellPlayhead: {
    borderColor: '#ff5c8a',
  },
  // Vertical line overlaid on the track at the playhead's pixel
  // position. Travels through sub-frames of held groups (since each
  // duplicate is a full CELL_BASE wide), so a ×3 hold visibly ticks
  // 3 positions across the cell as it plays. Same pink as the
  // active-cell border + the canvas highlight so the three pieces
  // of chrome read as one unified "this is the active frame" cue.
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#ff5c8a',
    pointerEvents: 'none',
    boxShadow: '0 0 4px rgba(255, 92, 138, 0.7)',
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: vscode.fg,
    paddingInline: 3,
    borderRadius: radius.sm,
    fontSize: '8px',
  },
  // 6px right-edge grab strip for the hold gesture (Task 8). Painted
  // here so the visual affordance ships with v0; pointer handlers
  // arrive in the next task.
  edgeGrab: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 6,
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: { default: 'transparent', ':hover': vscode.focusRing },
    opacity: 0.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: vscode.focusRing,
    flexShrink: 0,
    cursor: 'pointer',
  },
  dotHold: {
    minWidth: 8,
    borderRadius: 4,
  },
  dotPlayhead: {
    backgroundColor: vscode.fg,
  },
  empty: {
    color: vscode.descriptionFg,
    fontSize: '11px',
    fontStyle: 'italic',
    paddingBlock: space.lg,
    paddingInline: space.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'transparent',
    borderRadius: radius.sm,
  },
  // Drop-target hover treatment: focus-ring tint that wraps around
  // whichever track the body's currently rendering. Applied to all
  // three densities so the affordance reads no matter what mode the
  // user has the drawer in.
  trackOver: {
    backgroundColor: 'rgba(108, 200, 255, 0.08)',
    boxShadow: `inset 0 0 0 1px ${vscode.focusRing}`,
    borderRadius: radius.sm,
  },
  emptyOver: {
    borderColor: vscode.focusRing,
    backgroundColor: 'rgba(108, 200, 255, 0.08)',
    color: vscode.fg,
    fontStyle: 'normal',
  },
})

export function AnimationTimeline({
  frames,
  rectsByName,
  atlasImageUri,
  atlasSize,
  density,
  playheadGroupIndex,
  playhead,
  isPlaying = false,
  getSmoothPlayhead,
  onSeekGroup,
  onClearHighlight,
  onChangeHold,
  onDropFrames,
}: AnimationTimelineProps) {
  const groups = useMemo(() => groupCells(frames), [frames])

  // Hold drag-edge state. We commit each pixel-step worth of count
  // change LIVE through `onChangeHold` instead of buffering it
  // locally — that way the tick loop in the App sees the real
  // frame count and playback continues smoothly through the
  // freshly-added (or freshly-removed) sub-frames. `lastCommitted`
  // dedupes so we only fire when the integer count actually changed.
  const dragRef = useRef<{
    groupIndex: number
    startX: number
    startCount: number
    lastCommitted: number
  } | null>(null)

  // Hover-highlight while a drag is over the timeline. Drives the
  // focus-ring border + tinted background on whichever sub-track
  // (detail / dots / empty) is currently rendering.
  const [isDragOver, setIsDragOver] = useState(false)

  // Track ref + space-hold pan + edge auto-scroll. The track is the
  // scrollable element for the detail / dots renders; we mutate its
  // scrollLeft directly via ref so the scroll motion bypasses
  // React's render loop. `holdResizeActive` flag is set by the
  // edge-grab pointer handlers (declared further down) and read by
  // the auto-scroll effect.
  const trackRef = useRef<HTMLDivElement>(null)
  const spaceHeldRef = useRef(false)
  const panDragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null)
  const [holdResizeActive, setHoldResizeActive] = useState(false)
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return
      spaceHeldRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      panDragRef.current = null
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Edge-auto-scroll: while a drag is active (hold-edge resize OR an
  // incoming frame drop from the dragKit), if the cursor sits within
  // ~1 cell-width of the track's left/right edge, scroll the track
  // toward that edge so the user can drop on / extend toward
  // off-screen frames. Single rAF loop driven off the latest cursor
  // position cached in a ref.
  const dragApi = useOptionalDrag()
  const cursorXRef = useRef<number | null>(null)
  useEffect(() => {
    const onMove = (e: PointerEvent) => { cursorXRef.current = e.clientX }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
  // dragApi.state.payload non-null = an incoming-frame drop is in
  // flight. Hold-edge gestures fall through this too because they
  // also call window-level pointermove and our local edge-pointer-
  // handlers manage scrollLeft via ref. We drive the auto-scroll
  // any time EITHER condition holds.
  const incomingDrop = dragApi?.state.payload != null
  const autoScrollActive = incomingDrop || holdResizeActive
  useEffect(() => {
    if (!autoScrollActive) return
    let raf = 0
    const tick = () => {
      const trk = trackRef.current
      const x = cursorXRef.current
      if (trk && x != null) {
        const r = trk.getBoundingClientRect()
        const TRIGGER = CELL_BASE
        const SPEED_MAX = 24
        // Speed scales with how close the cursor is to the edge —
        // and ramps to MAX when cursor is past the edge entirely.
        // Catches the common case of users dragging the edge grab
        // beyond the visible track during a hold-resize.
        if (x < r.left + TRIGGER) {
          const intensity = Math.max(0, Math.min(1, (r.left + TRIGGER - x) / TRIGGER))
          trk.scrollLeft = Math.max(0, trk.scrollLeft - SPEED_MAX * intensity)
        } else if (x > r.right - TRIGGER) {
          const intensity = Math.max(0, Math.min(1, (x - (r.right - TRIGGER)) / TRIGGER))
          trk.scrollLeft += SPEED_MAX * intensity
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [autoScrollActive])

  // Playback auto-scroll: while the animation is playing, keep the
  // playhead in view with a 1-cell leading buffer on both sides.
  // Only kicks in when the playhead is about to cross out — manual
  // scrolling otherwise stays untouched.
  useEffect(() => {
    if (!isPlaying || !getSmoothPlayhead) return
    let raf = 0
    const tick = () => {
      const trk = trackRef.current
      if (trk) {
        const px = playheadFrameToPx(getSmoothPlayhead(), groups)
        const buffer = CELL_BASE
        const visibleLeft = trk.scrollLeft
        const visibleRight = trk.scrollLeft + trk.clientWidth
        if (px < visibleLeft + buffer) {
          trk.scrollLeft = Math.max(0, px - buffer)
        } else if (px > visibleRight - buffer) {
          trk.scrollLeft = px - trk.clientWidth + buffer
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getSmoothPlayhead, groups])

  // Smooth-lerp playhead. Held here (above any early returns) so the
  // hook calls run on every render — empty / collapsed / dots paths
  // would otherwise change the hook count between renders (React
  // #310). The ref attaches in detail mode only; the effect is a
  // no-op when ref.current is null.
  const lineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const setLine = (frameIndex: number) => {
      const el = lineRef.current
      if (!el) return
      el.style.transform = `translateX(${playheadFrameToPx(frameIndex, groups)}px)`
    }
    if (!isPlaying || !getSmoothPlayhead) {
      setLine(playhead)
      return
    }
    let raf = 0
    const tick = () => {
      setLine(getSmoothPlayhead())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, getSmoothPlayhead, groups, playhead])
  const dropTarget = useDragTarget({
    accept: ['frames-panel', 'canvas-rect'],
    onEnter: () => setIsDragOver(true),
    onLeave: () => setIsDragOver(false),
    onDrop: (payload) => {
      setIsDragOver(false)
      if (payload.frameNames.length === 0) return
      onDropFrames?.(frames.length, payload.frameNames)
    },
  })

  // Hold drag-edge handlers. Each pointer-step that crosses an
  // integer cell-step boundary calls `onChangeHold` immediately so
  // the underlying frames + the App's tick loop see the live count
  // — playback flows through new sub-frames as you extend the cell.
  // `holdResizeActive` (declared at the top) is also flipped on so
  // the edge-auto-scroll loop runs while the gesture is active.
  const onEdgePointerDown = (groupIndex: number, count: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { groupIndex, startX: e.clientX, startCount: count, lastCommitted: count }
    setHoldResizeActive(true)
  }
  const onEdgePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const next = Math.max(1, drag.startCount + Math.round(dx / CELL_HOLD_PER_DUP))
    if (next !== drag.lastCommitted) {
      drag.lastCommitted = next
      onChangeHold?.(drag.groupIndex, next)
    }
  }
  const onEdgePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
    setHoldResizeActive(false)
  }
  const onEdgePointerCancel = () => {
    dragRef.current = null
    setHoldResizeActive(false)
  }

  if (frames.length === 0) {
    return (
      <div {...stylex.props(s.empty, isDragOver && s.emptyOver)} {...dropTarget}>
        {isDragOver
          ? 'Drop to create an animation'
          : 'Drag frames here, or select frames in the Frames panel and click + again to populate.'}
      </div>
    )
  }

  if (density === 'collapsed') return null

  // Static integer-snapped position used for the initial mount
  // before the rAF effect (declared at top) kicks in.
  const playheadPx = playheadFrameToPx(playhead, groups)

  // Space-hold pan + drop-target handlers — composed so both the
  // dragKit's enter/leave/up callbacks AND the pan gesture run on
  // the same events without one clobbering the other (later spreads
  // would otherwise override the dragKit's onPointerUp).
  const trackHandlers = {
    onPointerEnter: dropTarget.onPointerEnter,
    onPointerLeave: dropTarget.onPointerLeave,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!spaceHeldRef.current || e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      panDragRef.current = { startX: e.clientX, startScrollLeft: e.currentTarget.scrollLeft }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panDragRef.current) return
      const dx = e.clientX - panDragRef.current.startX
      e.currentTarget.scrollLeft = Math.max(0, panDragRef.current.startScrollLeft - dx)
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      // Pan first — release pointer capture if we were panning.
      if (panDragRef.current) {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        panDragRef.current = null
        return
      }
      // Otherwise let the drop target handle it.
      dropTarget.onPointerUp()
    },
  }

  if (density === 'dots') {
    return (
      <div
        ref={trackRef}
        {...stylex.props(s.trackDots, isDragOver && s.trackOver)}
        {...trackHandlers}
      >
        {groups.map((g, idx) => (
          <span
            key={`${g.startIndex}-${g.name}`}
            {...stylex.props(s.dot, g.count > 1 && s.dotHold, idx === playheadGroupIndex && s.dotPlayhead)}
            style={g.count > 1 ? { width: 8 + (g.count - 1) * 6 } : undefined}
            onClick={() => onSeekGroup(idx)}
            title={`${g.name} ×${g.count}`}
          />
        ))}
      </div>
    )
  }

  // detail
  return (
    <div
      ref={trackRef}
      {...stylex.props(s.trackDetail, isDragOver && s.trackOver)}
      {...trackHandlers}
      onClick={(e) => {
        // Bubble-only — fires when user clicks empty space between
        // cells (cells handle their own clicks). Lets the App clear
        // the active-frame highlight without leaving the timeline.
        if (e.target === e.currentTarget) onClearHighlight?.()
      }}
    >
      {groups.map((g, idx) => {
        const rect = rectsByName[g.name]
        const renderCount = g.count
        // +2 = the cell's 1px L + 1px R border. With box-sizing:
        // border-box this means the inner content area is exactly
        // CELL_BASE * count wide so all tiles render at full size.
        const width = CELL_BASE * renderCount + 2
        // Pre-compute the per-tile sprite-sheet positioning. Each
        // tile is its own background paint of the same frame so a
        // ×6 hold renders as 6 visible thumbnails — the user reads
        // the duplication count directly.
        const tileBg: CSSProperties = {}
        if (rect && atlasImageUri && atlasSize) {
          const scale = Math.min(CELL_BASE / rect.w, CELL_BASE / rect.h)
          tileBg.backgroundImage = `url(${atlasImageUri})`
          tileBg.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`
          const offX = (CELL_BASE - rect.w * scale) / 2 - rect.x * scale
          const offY = (CELL_BASE - rect.h * scale) / 2 - rect.y * scale
          tileBg.backgroundPosition = `${offX}px ${offY}px`
        }
        return (
          <div
            key={`${g.startIndex}-${g.name}`}
            {...stylex.props(s.cell, idx === playheadGroupIndex && s.cellPlayhead)}
            style={{ width }}
            onClick={() => onSeekGroup(idx)}
            title={`${g.name}${renderCount > 1 ? ` ×${renderCount}` : ''}`}
          >
            {Array.from({ length: renderCount }).map((_, tileIdx) => (
              <span
                key={tileIdx}
                {...stylex.props(s.cellTile)}
                style={tileBg}
                aria-hidden="true"
              />
            ))}
            {renderCount > 1 ? <span {...stylex.props(s.badge)}>×{renderCount}</span> : null}
            {onChangeHold ? (
              <div
                {...stylex.props(s.edgeGrab)}
                onPointerDown={onEdgePointerDown(idx, g.count)}
                onPointerMove={onEdgePointerMove}
                onPointerUp={onEdgePointerUp}
                onPointerCancel={onEdgePointerCancel}
              />
            ) : null}
          </div>
        )
      })}
      <div
        ref={lineRef}
        {...stylex.props(s.playheadLine)}
        style={{ left: 0, transform: `translateX(${playheadPx}px)`, willChange: 'transform' }}
        aria-hidden="true"
      />
    </div>
  )
}
