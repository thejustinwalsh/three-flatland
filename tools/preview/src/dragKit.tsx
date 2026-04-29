import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z } from '@three-flatland/design-system/tokens/z.stylex'

/** Where the drag started — drives the floating element's border tint. */
export type DragSourceKind = 'frames-panel' | 'canvas-rect' | 'timeline-cell'

/** A single frame's atlas-pixel rect — used for thumbnail positioning. */
export type DragAtlasFrame = {
  name: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * Payload carried by the drag. `frameNames` carries the full set —
 * a single-frame drag is just `[name]`, a multi-frame drag carries the
 * selection in order. `originIndex` lets the timeline know which cell
 * we lifted (for reorders).
 */
export type DragPayload = {
  kind: DragSourceKind
  frameNames: string[]
  /** Defined when dragging from the timeline (cell index in the active animation). */
  originIndex?: number
}

export type DragState = {
  payload: DragPayload | null
  clientX: number
  clientY: number
  /** Source URL of the atlas image — needed to render the thumbnail. */
  atlasImageUri: string | null
  /** Frame rects in atlas-image pixels — one per dragged frame. */
  atlasFrames: DragAtlasFrame[] | null
  /** Atlas image natural size — needed for the background-size math. */
  atlasSize: { w: number; h: number } | null
}

type DragApi = {
  state: DragState
  start(args: {
    payload: DragPayload
    clientX: number
    clientY: number
    atlasImageUri: string
    atlasFrames: DragAtlasFrame[]
    atlasSize: { w: number; h: number }
  }): void
  move(clientX: number, clientY: number): void
  end(): void
}

const EMPTY_STATE: DragState = {
  payload: null, clientX: 0, clientY: 0,
  atlasImageUri: null, atlasFrames: null, atlasSize: null,
}

const DragContext = createContext<DragApi | null>(null)

/** Mount once at the root of any tree that uses dragKit. */
export function DragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>(EMPTY_STATE)

  const api = useMemo<DragApi>(() => ({
    state,
    start: ({ payload, clientX, clientY, atlasImageUri, atlasFrames, atlasSize }) => {
      setState({ payload, clientX, clientY, atlasImageUri, atlasFrames, atlasSize })
    },
    move: (clientX, clientY) => {
      setState((s) => (s.payload ? { ...s, clientX, clientY } : s))
    },
    end: () => {
      setState(EMPTY_STATE)
    },
  }), [state])

  // Window-level move/up so the drag follows the cursor even when it leaves
  // the original source's bounds.
  useEffect(() => {
    if (!state.payload) return
    const onMove = (e: PointerEvent) => api.move(e.clientX, e.clientY)
    const onUp = () => api.end()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [state.payload, api])

  return (
    <DragContext.Provider value={api}>
      {children}
      <DragLayer />
    </DragContext.Provider>
  )
}

export function useDrag(): DragApi {
  const api = useContext(DragContext)
  if (!api) throw new Error('useDrag requires <DragProvider> ancestor')
  return api
}

/**
 * Like `useDrag` but tolerates a missing DragProvider — returns null
 * instead of throwing. Used by primitives (e.g. RectOverlay) that may
 * be embedded in tools that don't host the drag kit yet, where the
 * source behavior should silently no-op rather than blow up the tree.
 */
export function useOptionalDrag(): DragApi | null {
  return useContext(DragContext)
}

/**
 * Hook for source elements. Returns a pointerdown handler. Caller passes
 * the payload + the atlas info needed to render the thumbnails. When no
 * DragProvider is present, returns a no-op handler so consumers can
 * call this unconditionally at the top of a component. `atlasFrames`
 * order matches `payload.frameNames` order — the floating drag layer
 * renders them as a stack (or "+N" badge if many) in that order.
 */
export function useDragSource() {
  const api = useOptionalDrag()
  return useCallback(
    (
      e: ReactPointerEvent<Element>,
      args: {
        payload: DragPayload
        atlasImageUri: string
        atlasFrames: DragAtlasFrame[]
        atlasSize: { w: number; h: number }
      },
    ) => {
      if (!api) return
      if (args.atlasFrames.length === 0) return
      e.preventDefault()
      api.start({ ...args, clientX: e.clientX, clientY: e.clientY })
    },
    [api],
  )
}

/**
 * Hook for drop targets. Returns handlers to spread onto the target
 * element. `accept` filters which sources this target wants. `onDrop`
 * fires on pointerup *over* the target with the drag payload.
 */
export function useDragTarget(opts: {
  accept: readonly DragSourceKind[]
  onDrop(payload: DragPayload): void
  onEnter?(payload: DragPayload): void
  onLeave?(): void
}) {
  const api = useOptionalDrag()
  const isOverRef = useRef(false)
  const enter = useCallback(() => {
    if (!api?.state.payload) return
    if (!opts.accept.includes(api.state.payload.kind)) return
    isOverRef.current = true
    opts.onEnter?.(api.state.payload)
  }, [api?.state.payload, opts])
  const leave = useCallback(() => {
    if (!isOverRef.current) return
    isOverRef.current = false
    opts.onLeave?.()
  }, [opts])
  const drop = useCallback(() => {
    if (!api?.state.payload) return
    if (!isOverRef.current) return
    if (!opts.accept.includes(api.state.payload.kind)) return
    isOverRef.current = false
    opts.onDrop(api.state.payload)
    opts.onLeave?.()
  }, [api?.state.payload, opts])
  return {
    onPointerEnter: enter,
    onPointerLeave: leave,
    onPointerUp: drop,
  }
}

// ---------------------------------------------------------------------------
// DragLayer — floating thumbnail follows the cursor.
// ---------------------------------------------------------------------------

const SOURCE_BORDER: Record<DragSourceKind, string> = {
  'frames-panel': 'var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  'canvas-rect': '#ffcc00',
  'timeline-cell': 'var(--vscode-focusBorder)',
}

const CELL_SIZE = 32
const STACK_OFFSET = 10
const MAX_VISIBLE = 4

const s = stylex.create({
  // Wrapper sits at the cursor; individual cells are absolutely
  // positioned around it so they read as a left→right stack with
  // each card peeking past the previous.
  layer: {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: z.toast,
    width: CELL_SIZE,
    height: CELL_SIZE,
    transform: 'translate(-50%, -50%)',
  },
  cell: {
    position: 'absolute',
    top: 0,
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: radius.sm,
    backgroundColor: vscode.bg,
    backgroundRepeat: 'no-repeat',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
  },
  countBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingInline: 4,
    backgroundColor: vscode.focusRing,
    color: vscode.bg,
    borderRadius: 9,
    fontFamily: vscode.monoFontFamily,
    fontSize: '10px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
  },
})

function DragLayer() {
  const { state } = useDrag()
  if (!state.payload || !state.atlasImageUri || !state.atlasFrames || !state.atlasSize) return null
  const { atlasImageUri, atlasFrames, atlasSize, payload } = state
  const total = atlasFrames.length
  const visible = atlasFrames.slice(0, MAX_VISIBLE)
  const overflow = total - visible.length

  // We center the cluster on the cursor by offsetting the wrapper left
  // by half the visible stack width.
  const stackWidth = CELL_SIZE + STACK_OFFSET * (visible.length - 1)
  const wrapperLeft = state.clientX - stackWidth / 2 + CELL_SIZE / 2

  return (
    <div
      {...stylex.props(s.layer)}
      style={{ left: wrapperLeft, top: state.clientY }}
      aria-hidden="true"
    >
      {visible.map((f, i) => {
        const scale = Math.min(CELL_SIZE / f.w, CELL_SIZE / f.h)
        const bgW = atlasSize.w * scale
        const bgH = atlasSize.h * scale
        const offX = (CELL_SIZE - f.w * scale) / 2 - f.x * scale
        const offY = (CELL_SIZE - f.h * scale) / 2 - f.y * scale
        return (
          <div
            key={`${f.name}-${i}`}
            {...stylex.props(s.cell)}
            style={{
              left: i * STACK_OFFSET,
              borderColor: SOURCE_BORDER[payload.kind],
              backgroundImage: `url(${atlasImageUri})`,
              backgroundSize: `${bgW}px ${bgH}px`,
              backgroundPosition: `${offX}px ${offY}px`,
              // Leftmost on top so the playback order reads naturally
              // (first frame in front, later frames peek behind it).
              zIndex: visible.length - i,
            }}
          />
        )
      })}
      {total > 1 ? (
        <span
          {...stylex.props(s.countBadge)}
          style={{ left: stackWidth - 8, zIndex: visible.length + 1 }}
        >
          {total}
        </span>
      ) : null}
    </div>
  )
}
