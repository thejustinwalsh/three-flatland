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

/**
 * Payload carried by the drag. `frameName` is the single source of truth
 * for what's being dragged (matches the rect's `name`). `originIndex`
 * lets the timeline know which cell we lifted (for reorders).
 */
export type DragPayload = {
  kind: DragSourceKind
  frameName: string
  /** Defined when dragging from the timeline (cell index in the active animation). */
  originIndex?: number
}

export type DragState = {
  payload: DragPayload | null
  clientX: number
  clientY: number
  /** Source URL of the atlas image — needed to render the thumbnail. */
  atlasImageUri: string | null
  /** Frame rect in atlas-image pixels — for sprite-sheet positioning. */
  atlasFrame: { x: number; y: number; w: number; h: number } | null
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
    atlasFrame: { x: number; y: number; w: number; h: number }
    atlasSize: { w: number; h: number }
  }): void
  move(clientX: number, clientY: number): void
  end(): void
}

const EMPTY_STATE: DragState = {
  payload: null, clientX: 0, clientY: 0,
  atlasImageUri: null, atlasFrame: null, atlasSize: null,
}

const DragContext = createContext<DragApi | null>(null)

/** Mount once at the root of any tree that uses dragKit. */
export function DragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>(EMPTY_STATE)

  const api = useMemo<DragApi>(() => ({
    state,
    start: ({ payload, clientX, clientY, atlasImageUri, atlasFrame, atlasSize }) => {
      setState({ payload, clientX, clientY, atlasImageUri, atlasFrame, atlasSize })
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
 * Hook for source elements. Returns a pointerdown handler. Caller passes
 * the payload + the atlas info needed to render the thumbnail.
 */
export function useDragSource() {
  const api = useDrag()
  return useCallback(
    (
      e: ReactPointerEvent<Element>,
      args: {
        payload: DragPayload
        atlasImageUri: string
        atlasFrame: { x: number; y: number; w: number; h: number }
        atlasSize: { w: number; h: number }
      },
    ) => {
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
  const api = useDrag()
  const isOverRef = useRef(false)
  const enter = useCallback(() => {
    if (!api.state.payload) return
    if (!opts.accept.includes(api.state.payload.kind)) return
    isOverRef.current = true
    opts.onEnter?.(api.state.payload)
  }, [api.state.payload, opts])
  const leave = useCallback(() => {
    if (!isOverRef.current) return
    isOverRef.current = false
    opts.onLeave?.()
  }, [opts])
  const drop = useCallback(() => {
    if (!isOverRef.current || !api.state.payload) return
    if (!opts.accept.includes(api.state.payload.kind)) return
    isOverRef.current = false
    opts.onDrop(api.state.payload)
    opts.onLeave?.()
  }, [api.state.payload, opts])
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

const s = stylex.create({
  layer: {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: z.toast,
    width: 32,
    height: 32,
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: radius.sm,
    backgroundColor: vscode.bg,
    backgroundRepeat: 'no-repeat',
    transform: 'translate(-50%, -50%)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
  },
})

function DragLayer() {
  const { state } = useDrag()
  if (!state.payload || !state.atlasImageUri || !state.atlasFrame || !state.atlasSize) return null
  const { atlasImageUri, atlasFrame, atlasSize, payload } = state
  const cellSize = 32
  const scale = Math.min(cellSize / atlasFrame.w, cellSize / atlasFrame.h)
  const bgW = atlasSize.w * scale
  const bgH = atlasSize.h * scale
  const offX = -atlasFrame.x * scale
  const offY = -atlasFrame.y * scale
  return (
    <div
      {...stylex.props(s.layer)}
      style={{
        left: state.clientX,
        top: state.clientY,
        borderColor: SOURCE_BORDER[payload.kind],
        backgroundImage: `url(${atlasImageUri})`,
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${offX}px ${offY}px`,
      }}
      aria-hidden="true"
    />
  )
}
