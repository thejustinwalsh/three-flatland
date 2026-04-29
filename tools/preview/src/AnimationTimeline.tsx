import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'
import type { AnimationDrawerDensity } from './AnimationDrawer'
import { useDragTarget } from './dragKit'

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
  // Playhead cell: focus-ring border. Subtle on its own — the
  // primary "where am I in the animation" cue is the vertical
  // playhead line that travels through frames within the cell (see
  // `playheadLine` below).
  cellPlayhead: {
    borderColor: vscode.focusRing,
  },
  // Vertical line overlaid on the track at the playhead's pixel
  // position. Travels through sub-frames of held groups (since each
  // duplicate is a full CELL_BASE wide), so a ×3 hold visibly ticks
  // 3 positions across the cell as it plays.
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: vscode.focusRing,
    pointerEvents: 'none',
    boxShadow: `0 0 4px ${vscode.focusRing}`,
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
  onChangeHold,
  onDropFrames,
}: AnimationTimelineProps) {
  const groups = useMemo(() => groupCells(frames), [frames])

  // Smooth-lerp playhead. Held here so the hook calls run on every
  // render — early returns below for empty / collapsed / dots tracks
  // would otherwise change the hook count between renders (React #310).
  // The ref attaches to the line element only in detail mode, but the
  // effect itself is harmless when the ref is null.
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

  // Hover-highlight while a drag is over the timeline. Drives the
  // focus-ring border + tinted background on whichever sub-track
  // (detail / dots / empty) is currently rendering.
  const [isDragOver, setIsDragOver] = useState(false)
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

  // Hold drag-edge state. Lives here because the cell grab strip
  // needs access to the same `groups` array we're rendering. Mirror
  // into local state so the cell's width animates live during the
  // drag — much clearer than waiting for commit on pointerup.
  const dragRef = useRef<{ groupIndex: number; startX: number; startCount: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ groupIndex: number; count: number } | null>(null)

  const onEdgePointerDown = (groupIndex: number, count: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { groupIndex, startX: e.clientX, startCount: count }
    setDragPreview({ groupIndex, count })
  }
  const onEdgePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const next = Math.max(1, dragRef.current.startCount + Math.round(dx / CELL_HOLD_PER_DUP))
    setDragPreview((prev) =>
      prev != null && prev.count === next
        ? prev
        : { groupIndex: dragRef.current!.groupIndex, count: next },
    )
  }
  const onEdgePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const dx = e.clientX - dragRef.current.startX
    const next = Math.max(1, dragRef.current.startCount + Math.round(dx / CELL_HOLD_PER_DUP))
    if (next !== dragRef.current.startCount) {
      onChangeHold?.(dragRef.current.groupIndex, next)
    }
    dragRef.current = null
    setDragPreview(null)
  }
  const onEdgePointerCancel = () => {
    dragRef.current = null
    setDragPreview(null)
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

  if (density === 'dots') {
    return (
      <div {...stylex.props(s.trackDots, isDragOver && s.trackOver)} {...dropTarget}>
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
    <div {...stylex.props(s.trackDetail, isDragOver && s.trackOver)} {...dropTarget}>
      {groups.map((g, idx) => {
        const rect = rectsByName[g.name]
        const renderCount =
          dragPreview && dragPreview.groupIndex === idx ? dragPreview.count : g.count
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
