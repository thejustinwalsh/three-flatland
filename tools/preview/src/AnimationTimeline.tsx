import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'
import type { AnimationDrawerDensity } from './AnimationDrawer'
import { useDragSource, useDragTarget, useOptionalDrag } from './dragKit'

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
   * array. `frameNames` carries the dragged set (one entry for a
   * single drag, multiple for a multi-selection drag).
   */
  onDropFrames?(insertIndex: number, frameNames: readonly string[]): void
  /**
   * Called when a timeline cell was dragged to a new gap. App
   * removes the group at `fromGroupIndex` and re-inserts it at
   * `toGap` atomically (with a one-step adjustment to handle the
   * removal-shift when toGap > fromGroupIndex).
   */
  onReorderGroup?(fromGroupIndex: number, toGap: number): void
  /**
   * Map of frame-index-as-string → event tag, sourced from the
   * animation's `events` block. Cells whose group covers a tagged
   * frame render a flag badge; the right-click popover edits the
   * tag at the group's first frame.
   */
  events?: Record<string, string>
  /**
   * Set the event tag at a specific post-duplication frame index.
   * Pass an empty / null tag to remove. Caller persists into
   * the sidecar's `meta.animations[name].events`.
   */
  onSetEvent?(frameIndex: number, tag: string | null): void
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
// While a drop is hovered, push the cells around the active gap
// apart by this much to make the drop target unmistakable through
// the floating drag stack. ½ a cell wide reads as "definitely a
// gap, not a stray gutter".
const GAP_PUSH_PX = 20

const s = stylex.create({
  trackDetail: {
    // Hide the native horizontal scrollbar — it would otherwise reserve
    // ~14 px at the bottom of the track and read as asymmetric bottom
    // padding below the cell row. Wheel + space-drag + drag-to-edge
    // auto-scroll already cover scrolling, so the visible bar isn't
    // doing anything we'd lose.
    scrollbarWidth: 'none',
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
    transitionProperty: 'margin-left, margin-right',
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease-out',
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
    // Pin to the cell row exactly: top:0 (cells are flex-start aligned
    // in the track) and height = CELL_BASE so the line is contained
    // by the cell borders and overlaps the cell, rather than extending
    // into the drawer body's padding above/below.
    position: 'absolute',
    top: 0,
    height: CELL_BASE,
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
  // Right-edge grab strip for the hold-resize gesture. Wider than it
  // looks (`width: 12`) so the cell-drag-vs-edge-resize disambiguation
  // is forgiving — pressing within ~9 px of the right edge always
  // resolves to "resize" rather than firing a dragKit reorder. The
  // visible hover tint is still narrow because the strip is mostly
  // transparent (the focus ring fills only the inner 4 px via inset
  // box-shadow).
  edgeGrab: {
    position: 'absolute',
    top: 0,
    right: -3,
    width: 12,
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: 'transparent',
    boxShadow: {
      default: 'none',
      ':hover': `inset -3px 0 0 0 ${vscode.focusRing}`,
    },
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
    // Outer dimensions match `trackDetail` / `trackDots` exactly so the
    // empty→populated transition doesn't perturb the drawer's layout.
    // Previously the empty state had its own paddingBlock/paddingInline
    // which, combined with `flex: 1` on the drawer body, could let
    // content size feed back into the body's resolved height and
    // reflow the canvas above on drop.
    color: vscode.descriptionFg,
    fontSize: '11px',
    fontStyle: 'italic',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
  // Insertion-gap indicator: a 2px focus-ring vertical line painted
  // at the cursor's projected drop position while a drag is over
  // the track. Width slightly thicker + a soft glow so the user can
  // tell it apart from the playhead (pink).
  gapLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: vscode.focusRing,
    boxShadow: `0 0 6px ${vscode.focusRing}`,
    pointerEvents: 'none',
    transform: 'translateX(-1px)',
  },
  // Event flag badge — sits in the top-left corner of cells whose
  // group covers a tagged frame. Yellow so it doesn't clash with
  // the pink playhead chrome or focus-ring blue gap indicator.
  eventBadge: {
    position: 'absolute',
    top: 1,
    left: 1,
    paddingInline: 3,
    paddingBlock: 0,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#ffd060',
    fontSize: '8px',
    lineHeight: 1.2,
    fontFamily: vscode.monoFontFamily,
    pointerEvents: 'none',
    maxWidth: CELL_BASE - 6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eventPopover: {
    position: 'fixed',
    backgroundColor: vscode.panelBg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.45)',
    paddingBlock: space.xs,
    paddingInline: space.sm,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    gap: space.xs,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
  },
  eventInput: {
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontFamily: vscode.monoFontFamily,
    fontSize: '11px',
    width: 120,
    outlineWidth: 0,
  },
  eventBtn: {
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderWidth: 0,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    cursor: 'pointer',
    fontSize: '11px',
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
  onReorderGroup,
  events,
  onSetEvent,
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

  // Gap that the in-flight drop will land at: an integer in
  // [0, groups.length]. 0 = before the first cell; groups.length =
  // after the last. Drives the gap-line indicator and the eventual
  // insert position passed to onDropFrames.
  const [hoverGap, setHoverGap] = useState<number | null>(null)
  const hoverGapRef = useRef(hoverGap)
  hoverGapRef.current = hoverGap

  // Right-click event-tag popover. `frameIndex` is the group's
  // first frame (= where the tag is stored in events).
  const [eventPopover, setEventPopover] = useState<{
    frameIndex: number
    x: number
    y: number
    draft: string
  } | null>(null)
  // Close on outside click / Escape.
  useEffect(() => {
    if (!eventPopover) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-event-popover]')) return
      setEventPopover(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEventPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [eventPopover])

  // Track ref + space-hold pan + edge auto-scroll. The track is the
  // scrollable element for the detail / dots renders; we mutate its
  // scrollLeft directly via ref so the scroll motion bypasses
  // React's render loop. `holdResizeActive` flag is set by the
  // edge-grab pointer handlers (declared further down) and read by
  // the auto-scroll effect.
  const trackRef = useRef<HTMLDivElement>(null)
  const spaceHeldRef = useRef(false)
  const panDragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null)
  // Render-time mirror of `spaceHeldRef` so the cursor style can react
  // to the hold (refs alone don't trigger a re-render). Keep both: the
  // ref is read inside event handlers (always-fresh value, no stale
  // closure), the state drives the inline cursor on the timeline div.
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [holdResizeActive, setHoldResizeActive] = useState(false)
  useEffect(() => {
    const isEditable = (t: EventTarget | null): boolean => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditable(e.target)) return
      spaceHeldRef.current = true
      setIsSpaceDown(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
      panDragRef.current = null
      setIsSpaceDown(false)
      setIsPanning(false)
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

  // Compute the insertion gap (an integer in [0, groups.length])
  // from the cursor's local-X-with-scroll while a drop is in flight.
  // 0 = before the first cell, groups.length = after the last.
  // Drives the gap-line indicator + the insertion frame index
  // passed to onDropFrames.
  useEffect(() => {
    if (!incomingDrop || !isDragOver) {
      if (hoverGapRef.current !== null) setHoverGap(null)
      return
    }
    let raf = 0
    const tick = () => {
      const trk = trackRef.current
      const x = cursorXRef.current
      if (trk && x != null) {
        const r = trk.getBoundingClientRect()
        const localX = x - r.left + trk.scrollLeft
        let gap = groups.length
        let cum = 0
        for (let i = 0; i < groups.length; i++) {
          const cellWidth = groups[i]!.count * CELL_BASE + 2
          if (localX < cum + cellWidth / 2) {
            gap = i
            break
          }
          cum += cellWidth + TRACK_GAP
        }
        if (hoverGapRef.current !== gap) setHoverGap(gap)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [incomingDrop, isDragOver, groups])
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
    accept: ['frames-panel', 'canvas-rect', 'timeline-cell'],
    onEnter: () => setIsDragOver(true),
    onLeave: () => {
      setIsDragOver(false)
      setHoverGap(null)
    },
    onDrop: (payload) => {
      setIsDragOver(false)
      const gap = hoverGapRef.current ?? groups.length
      setHoverGap(null)
      // Timeline-cell source carries originIndex → it's a reorder,
      // not an insert. Skip the no-op self-drops (gap ===
      // originIndex / originIndex+1 both leave the group in place).
      if (payload.kind === 'timeline-cell' && payload.originIndex != null) {
        if (gap === payload.originIndex || gap === payload.originIndex + 1) return
        onReorderGroup?.(payload.originIndex, gap)
        return
      }
      if (payload.frameNames.length === 0) return
      // Convert hovered gap (group index) → frame insertion index.
      // Gap N inserts before group N: insertIndex = sum of counts
      // for groups 0..N-1. Falls back to end-append if no gap was
      // computed (drop fired without enough cursor data).
      const insertIndex = groups.slice(0, gap).reduce((acc, g) => acc + g.count, 0)
      onDropFrames?.(insertIndex, payload.frameNames)
    },
  })

  // Cell-body drag for reorder. Pointerdown captures the pointer on
  // the cell so all subsequent move/up events fire on the cell
  // regardless of where the cursor travels — without capture, a drag
  // that left the cell could leak `cellDragRef` (no pointerup would
  // fire on the original cell) and the next hover would replay the
  // drag against stale start coords. Once movement crosses the
  // threshold we hand off to the dragKit so the floating-thumbnail
  // visual takes over. A click (no movement past threshold) falls
  // through to the cell's onClick (seek + highlight).
  const startCellDrag = useDragSource()
  // 8 px threshold (64 squared) — high enough that accidental motion
  // when missing the edge-grab strip doesn't trigger a reorder. The
  // edgeGrab is 12 px so any drag within 9 px of the right edge is
  // already absorbed by the resize handler.
  const CELL_DRAG_THRESHOLD_SQ = 64
  const cellDragRef = useRef<{
    groupIndex: number
    pointerId: number
    startX: number
    startY: number
    started: boolean
  } | null>(null)

  const clearCellDrag = useCallback(() => {
    cellDragRef.current = null
  }, [])

  // Window-level safety: if the pointer comes up anywhere (including
  // outside the cell, after a drag aborted via Escape from the
  // dragKit, etc.), drop the cell-drag ref. Otherwise a stale ref
  // would survive into the next hover and replay the drag.
  useEffect(() => {
    const onWindowPointerUp = () => clearCellDrag()
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  }, [clearCellDrag])

  const onCellPointerDown = (groupIndex: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // The edge-grab uses stopPropagation in its own handler so we
    // shouldn't see its pointerdowns here, but defend anyway.
    if ((e.target as HTMLElement).closest('[data-edgegrab]')) return
    if (spaceHeldRef.current) return // space-pan owns the gesture
    e.currentTarget.setPointerCapture(e.pointerId)
    cellDragRef.current = {
      groupIndex,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      started: false,
    }
  }
  const onCellPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = cellDragRef.current
    if (!drag || drag.started || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (dx * dx + dy * dy < CELL_DRAG_THRESHOLD_SQ) return
    drag.started = true
    const g = groups[drag.groupIndex]
    if (!g || !atlasImageUri || !atlasSize) {
      cellDragRef.current = null
      return
    }
    const rect = rectsByName[g.name]
    if (!rect) {
      cellDragRef.current = null
      return
    }
    // Hand off pointer ownership to the dragKit — release our capture
    // first so the dragKit's window-level handlers can take over the
    // gesture cleanly without fighting our captured listeners.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    startCellDrag(e, {
      payload: { kind: 'timeline-cell', frameNames: [g.name], originIndex: drag.groupIndex },
      atlasImageUri,
      atlasFrames: [{ name: g.name, x: rect.x, y: rect.y, w: rect.w, h: rect.h }],
      atlasSize,
    })
  }
  const onCellPointerUpForReorder = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    clearCellDrag()
  }

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

  // Window-level safety for the edge resize. Pointer capture should
  // guarantee pointerup fires on the captured element, but if it
  // somehow doesn't (focus loss, devtools intervention, ...) the
  // cell would otherwise stay in the holdResizeActive state — which
  // also keeps the edge-auto-scroll loop running. This belt-and-
  // suspenders unwinds the gesture on any window-level pointer
  // release.
  useEffect(() => {
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        setHoldResizeActive(false)
      }
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // Cursor variant applied to the timeline outer wrapper while space is
  // held (mirrors the CanvasStage's pan-mode cursor). Computed once so
  // every render path (empty / dots / detail) uses the same value.
  const spaceCursor: 'grab' | 'grabbing' | undefined = isPanning
    ? 'grabbing'
    : isSpaceDown
    ? 'grab'
    : undefined

  if (frames.length === 0) {
    return (
      <div
        {...stylex.props(s.empty, isDragOver && s.emptyOver)}
        {...dropTarget}
        style={spaceCursor ? { cursor: spaceCursor } : undefined}
      >
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
      setIsPanning(true)
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
        setIsPanning(false)
        return
      }
      // Otherwise let the drop target handle it.
      dropTarget.onPointerUp()
    },
  }

  // The 'dots' / small-player density was dropped in favor of the
  // single fixed-height drawer. Anything non-collapsed renders the
  // detail track below; the `density` prop is kept on the API surface
  // for back-compat but only `'detail'` is exercised in practice.

  // detail
  return (
    <div
      ref={trackRef}
      {...stylex.props(s.trackDetail, isDragOver && s.trackOver)}
      {...trackHandlers}
      // Suppress the native horizontal scrollbar (matches the global
      // rule in styles.css). Wheel + space-drag + edge auto-scroll
      // cover the scrolling UX without the visible bar.
      data-no-scrollbar=""
      style={spaceCursor ? { cursor: spaceCursor } : undefined}
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
            style={{
              width,
              // Spread the cells around the active drop gap. The cell
              // AT hoverGap (i.e. the one immediately AFTER the gap)
              // gets pushed right by GAP_PUSH_PX so the visual gap
              // grows from TRACK_GAP to TRACK_GAP + GAP_PUSH_PX —
              // legible even through a 4-cell drag stack.
              marginInlineStart: hoverGap === idx ? GAP_PUSH_PX : undefined,
            }}
            onClick={() => onSeekGroup(idx)}
            onPointerDown={onCellPointerDown(idx)}
            onPointerMove={onCellPointerMove}
            onPointerUp={onCellPointerUpForReorder}
            onPointerCancel={onCellPointerUpForReorder}
            onContextMenu={onSetEvent ? (e) => {
              e.preventDefault()
              const existing = events?.[String(g.startIndex)] ?? ''
              setEventPopover({
                frameIndex: g.startIndex,
                x: e.clientX,
                y: e.clientY,
                draft: existing,
              })
            } : undefined}
            title={`${g.name}${renderCount > 1 ? ` ×${renderCount}` : ''}${
              events?.[String(g.startIndex)] ? ` · event: ${events[String(g.startIndex)]}` : ''
            }`}
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
            {events?.[String(g.startIndex)] ? (
              <span {...stylex.props(s.eventBadge)}>⚑ {events[String(g.startIndex)]}</span>
            ) : null}
            {onChangeHold ? (
              <div
                data-edgegrab=""
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
      <ScrollIndicator trackRef={trackRef} contentKey={frames.length} />
      {hoverGap != null && hoverGap === groups.length ? (
        // End-of-track spread: cells map margin-left to push, but
        // the gap AFTER the last cell has no cell to push, so render
        // a spacer of the same width to materialise the gap visually.
        <div
          aria-hidden="true"
          style={{
            width: GAP_PUSH_PX,
            flexShrink: 0,
            transition: 'width 120ms ease-out',
          }}
        />
      ) : null}
      {hoverGap != null ? (() => {
        // Gap pixel = sum of (cell-outer + TRACK_GAP) for cells
        // before the gap. Center the line in the spread space:
        // visible gap = TRACK_GAP + GAP_PUSH_PX, so the line sits
        // at x + (visible-gap)/2 - TRACK_GAP (back off the gutter
        // we'd already counted toward x).
        let x = 0
        for (let i = 0; i < hoverGap && i < groups.length; i++) {
          x += groups[i]!.count * CELL_BASE + 2 + TRACK_GAP
        }
        const left = Math.max(0, x - TRACK_GAP / 2 + GAP_PUSH_PX / 2)
        return <div {...stylex.props(s.gapLine)} style={{ left }} aria-hidden="true" />
      })() : null}
      {eventPopover != null && onSetEvent ? (
        <div
          data-event-popover=""
          {...stylex.props(s.eventPopover)}
          style={{ left: eventPopover.x, top: eventPopover.y + 6 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            {...stylex.props(s.eventInput)}
            placeholder="event tag"
            value={eventPopover.draft}
            onChange={(e) =>
              setEventPopover((prev) => (prev ? { ...prev, draft: e.target.value } : prev))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSetEvent(eventPopover.frameIndex, eventPopover.draft.trim() || null)
                setEventPopover(null)
              } else if (e.key === 'Escape') {
                setEventPopover(null)
              }
            }}
          />
          <button
            type="button"
            {...stylex.props(s.eventBtn)}
            onClick={() => {
              onSetEvent(eventPopover.frameIndex, eventPopover.draft.trim() || null)
              setEventPopover(null)
            }}
          >
            Save
          </button>
          {events?.[String(eventPopover.frameIndex)] ? (
            <button
              type="button"
              {...stylex.props(s.eventBtn)}
              onClick={() => {
                onSetEvent(eventPopover.frameIndex, null)
                setEventPopover(null)
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Thin horizontal scroll indicator pinned to the bottom edge of the
 * timeline track. Mostly transparent overlay (sits over the cell row's
 * bottom few pixels) that surfaces only while the user is actively
 * scrolling — wheel, drag-pan, edge auto-scroll, anything that moves
 * `scrollLeft`. Width and X-translate are computed from the track's
 * `scrollLeft / scrollWidth / clientWidth`. Hidden when there's no
 * horizontal overflow at all.
 *
 * The user wanted "some kind of scroll indicator that fades in while
 * updating scroll offsets" — this is the minimal version. Native
 * `::-webkit-scrollbar` would clip oddly inside a 40 px track; an
 * absolutely-positioned div lets us overlap the cells without
 * eating layout space.
 */
function ScrollIndicator({
  trackRef,
  contentKey,
}: {
  trackRef: React.RefObject<HTMLDivElement | null>
  /**
   * Bumps whenever the timeline's cell content changes (e.g. frames
   * added/removed, hold counts edited). Triggers a re-measure so the
   * indicator hides when content shrinks back below the viewport
   * (otherwise the scroll event never fires and the indicator stays
   * visible at its last position).
   */
  contentKey: number
}) {
  const indicatorRef = useRef<HTMLDivElement>(null)
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = useCallback(() => {
    const track = trackRef.current
    const indicator = indicatorRef.current
    if (!track || !indicator) return
    const { scrollLeft, scrollWidth, clientWidth } = track
    if (scrollWidth <= clientWidth + 1) {
      // No overflow — hide and clear any pending fade so we don't
      // re-emerge at low opacity later.
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
        fadeTimeoutRef.current = null
      }
      indicator.style.opacity = '0'
      return
    }
    const trackPx = clientWidth
    const thumbPx = Math.max(16, (clientWidth / scrollWidth) * trackPx)
    const maxThumbX = trackPx - thumbPx
    const scrollFrac = scrollLeft / (scrollWidth - clientWidth || 1)
    const thumbX = scrollFrac * maxThumbX
    indicator.style.width = `${thumbPx}px`
    indicator.style.transform = `translateX(${thumbX}px)`
    indicator.style.opacity = '0.55'
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    fadeTimeoutRef.current = setTimeout(() => {
      if (indicatorRef.current) indicatorRef.current.style.opacity = '0.18'
    }, 800)
  }, [trackRef])

  // Re-measure on content changes (cells added/removed). The scroll
  // event alone misses this — scrollLeft doesn't change when cells
  // disappear, so without this branch the indicator would stay stuck
  // at its last position after a delete or animation switch.
  useEffect(() => {
    update()
  }, [contentKey, update])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    track.addEventListener('scroll', update, { passive: true })
    const raf = requestAnimationFrame(update)
    // Track resizes covers panel-split / drawer-width changes; doesn't
    // catch content-only changes, which `contentKey` handles above.
    const ro = new ResizeObserver(update)
    ro.observe(track)
    return () => {
      track.removeEventListener('scroll', update)
      cancelAnimationFrame(raf)
      ro.disconnect()
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    }
  }, [trackRef, update])

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      style={{
        // 4 px tall and bottom: 0 puts the indicator flush against the
        // cells' bottom edge — no gap, fills the bottom-of-track slot
        // exactly. Mostly transparent so it overlaps the cells without
        // obscuring them.
        position: 'absolute',
        left: 0,
        bottom: 0,
        height: 4,
        width: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.65)',
        borderRadius: 2,
        opacity: 0,
        transition: 'opacity 200ms ease-out',
        pointerEvents: 'none',
        willChange: 'transform, width, opacity',
      }}
    />
  )
}
