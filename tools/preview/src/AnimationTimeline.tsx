import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
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
const CELL_HOLD_PER_DUP = 16

const s = stylex.create({
  trackDetail: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.xs,
    height: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  trackDots: {
    display: 'flex',
    alignItems: 'center',
    gap: space.xs,
    height: '100%',
    paddingInline: space.sm,
    overflowX: 'auto',
  },
  cell: {
    boxSizing: 'border-box',
    height: CELL_BASE,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    backgroundColor: vscode.bg,
    backgroundRepeat: 'no-repeat',
    position: 'relative',
    color: vscode.descriptionFg,
    fontFamily: vscode.monoFontFamily,
    fontSize: '8px',
    flexShrink: 0,
    cursor: 'pointer',
  },
  cellPlayhead: {
    borderColor: vscode.focusRing,
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
  onSeekGroup,
  onChangeHold,
  onDropFrames,
}: AnimationTimelineProps) {
  const groups = useMemo(() => groupCells(frames), [frames])

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

  // Hold drag-edge state (Task 8). Lives here because the cell grab strip
  // needs access to the same `groups` array we're rendering.
  const dragRef = useRef<{ groupIndex: number; startX: number; startCount: number } | null>(null)

  const onEdgePointerDown = (groupIndex: number, count: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { groupIndex, startX: e.clientX, startCount: count }
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
        const width = CELL_BASE + (g.count - 1) * CELL_HOLD_PER_DUP
        const bgStyle: CSSProperties = {}
        if (rect && atlasImageUri && atlasSize) {
          const scale = Math.min(CELL_BASE / rect.w, CELL_BASE / rect.h)
          bgStyle.backgroundImage = `url(${atlasImageUri})`
          bgStyle.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`
          // Center the sprite inside the cell.
          const offX = (CELL_BASE - rect.w * scale) / 2 - rect.x * scale
          const offY = (CELL_BASE - rect.h * scale) / 2 - rect.y * scale
          bgStyle.backgroundPosition = `${offX}px ${offY}px`
        }
        return (
          <div
            key={`${g.startIndex}-${g.name}`}
            {...stylex.props(s.cell, idx === playheadGroupIndex && s.cellPlayhead)}
            style={{ width, ...bgStyle }}
            onClick={() => onSeekGroup(idx)}
            title={`${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`}
          >
            {g.count > 1 ? <span {...stylex.props(s.badge)}>×{g.count}</span> : null}
            {onChangeHold ? (
              <div
                {...stylex.props(s.edgeGrab)}
                onPointerDown={onEdgePointerDown(idx, g.count)}
                onPointerUp={onEdgePointerUp}
                onPointerCancel={() => { dragRef.current = null }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
