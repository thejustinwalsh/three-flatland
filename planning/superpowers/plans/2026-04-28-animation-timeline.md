# Animation Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-animation editing to the FL Sprite Atlas tool — a collapsible drawer inside the Atlas pane lets the user define named animations from existing frames, set hold counts via frame duplication, and preview live in a floating PIP square inside the canvas while continuing to edit rects.

**Architecture:** A persistent collapsible drawer is mounted as a peer of `<CanvasStage>` inside the Atlas pane (right column unchanged). Drawer header carries always-visible chrome (animation dropdown, play, fps/loop/ping-pong chips, +new); body renders the timeline at one of three densities auto-derived from drawer height (detail thumbnails / dots / collapsed). A floating `AnimationPreviewPip` lives inside the canvas, click-to-hop corners, plays the active animation reading from the live `rects` array (no snapshot — edits update next frame). A shared `dragKit` module powers three drag origins (Frames panel icon, canvas rect via Alt+drag, timeline cell reorder) into one floating drag visual. Reuses the existing `meta.animations` schema verbatim.

**Tech Stack:** React 19 + StyleX + `@vscode-elements/react-elements` + `requestAnimationFrame` for playback ticks. No new dependencies. No test framework added — the project has no UI test infrastructure; verification is `pnpm typecheck` + `pnpm build` + manual F5 smoke test, matching the existing commit cadence on this branch.

**Spec:** `planning/superpowers/specs/2026-04-28-animation-timeline-design.md`

---

## File map

### New files (all under `tools/preview/src/` unless noted)

| File | Responsibility |
|---|---|
| `animationStore.ts` | Active anim index, playhead, isPlaying, fps; rAF tick loop; pure `advancePlayhead` helper for forward/loop/ping-pong. Ref-backed store, `useSyncExternalStore` hook. |
| `dragKit.tsx` | `DragContext`, `DragProvider`, `useDragSource`, `useDragTarget`, `<DragLayer />`. Floating element renders the same icon thumbnail for all sources, border-tinted by source kind. |
| `AnimationDrawer.tsx` | Collapsible shell: chevron-toggleable header, top-edge resize splitter, body container that picks density from measured height. |
| `AnimationDrawerHeader.tsx` | Header row: chevron, label, animation dropdown (with inline rename), play/pause, fps chip, loop chip, ping-pong chip, +new, ⋯ menu. |
| `AnimationTimeline.tsx` | Body: detail (thumbnails) and dots renderings, hold drag-edge gesture, cell drag-to-reorder, drop targets for incoming frames. |
| `AnimationPreviewPip.tsx` | Floating square inside the canvas: sprite area + 14px transport bar; click anywhere = hop corners. |

### Modified

| File | Change |
|---|---|
| `tools/vscode/webview/atlas/prefs.ts` | Add `animDrawerExpanded`, `animDrawerHeight`, `animPipCorner`. |
| `tools/vscode/webview/atlas/App.tsx` | Add `animations` state + handlers; mount `<AnimationDrawer>` in Atlas pane via vertical splitter; mount `<AnimationPreviewPip>` inside `<CanvasStage>`; add folder ⊞-all icon + folder-selection visual + Add-to-anim button to Frames panel. |
| `tools/preview/src/RectOverlay.tsx` | Alt+drag a rect body initiates `dragKit` source `'canvas-rect'`. Plain drag still does move. |
| `tools/preview/src/index.ts` | Export new components and types. |

---

## Conventions in this codebase (read first)

The plan assumes you know these. They're load-bearing:

1. **No semicolons, single quotes, trailing commas** (Prettier).
2. **`type` keyword on type-only imports** (`import type { ReactNode } from 'react'`).
3. **StyleX**: every component uses `stylex.create({...})` with longhand properties. Conditional values nested per property: `color: { default: 'x', ':hover': 'y' }`. Tokens come from `@three-flatland/design-system/tokens/*.stylex` subpaths (`vscode`, `space`, `radius`, `z`). Never use `var(--vscode-…)` directly inside `stylex.create` — go through tokens.
4. **No `style={{}}` next to `{...stylex.props(...)}`** — fold inline styles into `stylex.create`.
5. **Refs for stable callbacks** — `useCallback` with empty deps + ref-mirrored props is the pattern (see `CanvasStage.tsx`'s `pixelSnapZoomRef` / `maybeSnap`).
6. **VSCode bash quirk**: `unset NODE_OPTIONS &&` prefixes every `pnpm` / `git` invocation — there's a stale preload module that breaks otherwise.
7. **Prefs store**: `prefsStore.set({ … })` patches; `usePrefs()` for hook access. Already wired in `tools/vscode/webview/atlas/prefs.ts`.
8. **Build verification**: `pnpm -F @three-flatland/preview -F @three-flatland/design-system -F @three-flatland/vscode typecheck` for typecheck; `pnpm -F @three-flatland/vscode build` for the webview Vite build (this is what catches StyleX shorthand violations and unsupported expressions).
9. **Git commits** — Conventional Commits, no co-authored-by attribution. Use HEREDOC. Stage explicit paths, never `git add -A` (pre-existing `planning/experiments/` keeps getting swept in).

---

## Task 1 — Extend `AtlasPrefs` with animation preferences

**Files:**
- Modify: `tools/vscode/webview/atlas/prefs.ts`

- [ ] **Step 1 — Add new fields to the `AtlasPrefs` type and `DEFAULTS`**

Edit `tools/vscode/webview/atlas/prefs.ts`. Find the `AtlasPrefs` type definition (already contains `colorMode`, `coordMode`, `background`, `dimOutOfBounds`, `showFrameNumbers`, `showHoverChip`, `showInfoPanel`, `pixelSnapZoom`). Add these fields at the bottom of the type:

```ts
  /**
   * Whether the animation drawer (inside the Atlas pane) is expanded.
   * Defaults true once the sidecar contains animations; the runtime
   * resets it to true on first load if `meta.animations` has entries.
   */
  animDrawerExpanded: boolean
  /** Drawer body height in pixels when expanded. Persisted across sessions. */
  animDrawerHeight: number
  /** Last corner the floating preview PIP was parked in. */
  animPipCorner: 'tl' | 'tr' | 'br' | 'bl'
```

Add corresponding entries to `DEFAULTS`:

```ts
  animDrawerExpanded: false,
  animDrawerHeight: 140,
  animPipCorner: 'br',
```

Bump `STORAGE_KEY` is **not** required — the loader merges over defaults so additive fields pick up their defaults automatically (see the existing comment in the file).

- [ ] **Step 2 — Typecheck**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/vscode typecheck
```

Expected: `Done`, no errors.

- [ ] **Step 3 — Commit**

```bash
unset NODE_OPTIONS && git add tools/vscode/webview/atlas/prefs.ts && git commit -m "feat(atlas): prefs additions for animation drawer + PIP corner"
```

---

## Task 2 — `animationStore.ts` with rAF tick loop

**Files:**
- Create: `tools/preview/src/animationStore.ts`

- [ ] **Step 1 — Create the store file**

Create `tools/preview/src/animationStore.ts` with this content:

```ts
import { useSyncExternalStore } from 'react'

/**
 * Playback snapshot consumed by the drawer header (▶ button), the PIP
 * (current frame index), and the timeline (cursor position).
 */
export type PlaybackSnapshot = {
  /** Name of the active animation in `meta.animations`, or null. */
  activeAnimation: string | null
  /** Index into the active animation's `frames` array (after duplication). */
  playhead: number
  isPlaying: boolean
}

export type AnimationStore = {
  get(): PlaybackSnapshot
  /** Set active animation; resets playhead to 0 and pauses. */
  setActive(name: string | null): void
  /** Toggle play/pause. */
  togglePlay(): void
  play(): void
  pause(): void
  /** Direct seek; clamps to [0, frameCount). */
  seek(index: number): void
  /**
   * Drive playback by `dtMs` (called from the rAF loop). Caller passes
   * frame count + fps + loop flags so the store stays free of any
   * sidecar dependency. Updates playhead and isPlaying (sets isPlaying
   * = false at end of a non-loop animation).
   */
  tick(dtMs: number, frameCount: number, fps: number, loop: boolean, pingPong: boolean): void
  subscribe(fn: () => void): () => void
}

/**
 * Pure-function helper, exported for any other callers that want to
 * derive the next frame given a current state. Forward by default;
 * `pingPong` ignored unless `loop` is also true (ping-pong implies
 * looping back-and-forth).
 */
export function advancePlayhead(
  current: number,
  step: number,
  frameCount: number,
  loop: boolean,
  pingPong: boolean,
  /** Direction state (for ping-pong). +1 forward, -1 reverse. */
  direction: 1 | -1,
): { playhead: number; direction: 1 | -1; ended: boolean } {
  if (frameCount <= 0) return { playhead: 0, direction, ended: true }
  if (frameCount === 1) return { playhead: 0, direction, ended: !loop }
  let next = current + step * direction
  let nextDir: 1 | -1 = direction
  let ended = false
  if (next >= frameCount) {
    if (pingPong && loop) {
      // Bounce: walk back from the last frame
      next = frameCount - 2 - (next - frameCount)
      nextDir = -1
    } else if (loop) {
      next = next % frameCount
    } else {
      next = frameCount - 1
      ended = true
    }
  } else if (next < 0) {
    // Only reachable in ping-pong reverse phase
    if (pingPong && loop) {
      next = -next
      nextDir = 1
    } else {
      next = 0
      ended = true
    }
  }
  return { playhead: next, direction: nextDir, ended }
}

/**
 * Ref-backed store. Single tick loop driven externally — the consumer
 * (App) wires a useEffect that walks rAF and calls `tick()` whenever
 * isPlaying transitions to true.
 */
export function createAnimationStore(): AnimationStore {
  let snapshot: PlaybackSnapshot = { activeAnimation: null, playhead: 0, isPlaying: false }
  // Internal direction for ping-pong, hidden from snapshot.
  let direction: 1 | -1 = 1
  // Sub-frame accumulator so a slow rAF (16ms) still advances exactly
  // 1 frame at 60fps and ~0.2 frames at 12fps each tick.
  let accum = 0
  const listeners = new Set<() => void>()
  const emit = () => { for (const l of listeners) l() }

  return {
    get: () => snapshot,
    setActive: (name) => {
      snapshot = { activeAnimation: name, playhead: 0, isPlaying: false }
      direction = 1
      accum = 0
      emit()
    },
    togglePlay: () => {
      snapshot = { ...snapshot, isPlaying: !snapshot.isPlaying }
      accum = 0
      emit()
    },
    play: () => {
      if (snapshot.isPlaying) return
      snapshot = { ...snapshot, isPlaying: true }
      accum = 0
      emit()
    },
    pause: () => {
      if (!snapshot.isPlaying) return
      snapshot = { ...snapshot, isPlaying: false }
      emit()
    },
    seek: (index) => {
      snapshot = { ...snapshot, playhead: Math.max(0, index) }
      accum = 0
      emit()
    },
    tick: (dtMs, frameCount, fps, loop, pingPong) => {
      if (!snapshot.isPlaying || frameCount === 0 || fps <= 0) return
      accum += (dtMs / 1000) * fps
      // Advance whole frames; keep the remainder for next tick.
      const whole = Math.floor(accum)
      if (whole === 0) return
      accum -= whole
      const result = advancePlayhead(snapshot.playhead, whole, frameCount, loop, pingPong, direction)
      direction = result.direction
      snapshot = {
        ...snapshot,
        playhead: result.playhead,
        isPlaying: result.ended ? false : snapshot.isPlaying,
      }
      emit()
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

/** Hook: subscribe to playback state in any component. */
export function useAnimationPlayback(store: AnimationStore | null): PlaybackSnapshot {
  return useSyncExternalStore(
    (fn) => (store ? store.subscribe(fn) : () => {}),
    () => (store ? store.get() : { activeAnimation: null, playhead: 0, isPlaying: false }),
    () => ({ activeAnimation: null, playhead: 0, isPlaying: false }),
  )
}
```

- [ ] **Step 2 — Export from package index**

Edit `tools/preview/src/index.ts`. Add at the end of the export block:

```ts
export {
  createAnimationStore,
  useAnimationPlayback,
  advancePlayhead,
  type AnimationStore,
  type PlaybackSnapshot,
} from './animationStore'
```

- [ ] **Step 3 — Sanity-check the pure helper**

The `advancePlayhead` function is pure — verify by reading through these mental cases against the implementation:

- `advancePlayhead(0, 1, 4, false, false, 1)` → `{ playhead: 1, direction: 1, ended: false }` (forward).
- `advancePlayhead(3, 1, 4, false, false, 1)` → `{ playhead: 3, direction: 1, ended: true }` (clamps + ends).
- `advancePlayhead(3, 1, 4, true, false, 1)` → `{ playhead: 0, direction: 1, ended: false }` (loops).
- `advancePlayhead(3, 1, 4, true, true, 1)` → `{ playhead: 2, direction: -1, ended: false }` (ping-pong bounce off end).
- `advancePlayhead(0, 1, 4, true, true, -1)` → `{ playhead: 1, direction: 1, ended: false }` (ping-pong bounce off start).
- `advancePlayhead(0, 1, 1, true, false, 1)` → `{ playhead: 0, direction: 1, ended: false }` (single-frame loop).

If any case looks wrong on inspection, fix the implementation before continuing.

- [ ] **Step 4 — Typecheck**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview typecheck
```

Expected: `Done`, no errors.

- [ ] **Step 5 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/animationStore.ts tools/preview/src/index.ts && git commit -m "feat(preview): animationStore — playback snapshot + advancePlayhead + rAF tick"
```

---

## Task 3 — `dragKit.tsx` foundation

**Files:**
- Create: `tools/preview/src/dragKit.tsx`

- [ ] **Step 1 — Create the drag kit**

Create `tools/preview/src/dragKit.tsx` with this content:

```tsx
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
  /** Begin a drag. Caller computes the frame rect + atlas info up-front. */
  start(args: {
    payload: DragPayload
    clientX: number
    clientY: number
    atlasImageUri: string
    atlasFrame: { x: number; y: number; w: number; h: number }
    atlasSize: { w: number; h: number }
  }): void
  /** Pointer-move while a drag is in flight. */
  move(clientX: number, clientY: number): void
  /** End a drag (commit handled by drop targets via `useDragTarget`). */
  end(): void
}

const DragContext = createContext<DragApi | null>(null)

/** Mount once at the root of any tree that uses dragKit. */
export function DragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>({
    payload: null,
    clientX: 0,
    clientY: 0,
    atlasImageUri: null,
    atlasFrame: null,
    atlasSize: null,
  })
  const stateRef = useRef(state)
  stateRef.current = state

  const api = useMemo<DragApi>(() => ({
    state,
    start: ({ payload, clientX, clientY, atlasImageUri, atlasFrame, atlasSize }) => {
      setState({ payload, clientX, clientY, atlasImageUri, atlasFrame, atlasSize })
    },
    move: (clientX, clientY) => {
      setState((s) => (s.payload ? { ...s, clientX, clientY } : s))
    },
    end: () => {
      setState({ payload: null, clientX: 0, clientY: 0, atlasImageUri: null, atlasFrame: null, atlasSize: null })
    },
  // We re-create on every state change so consumers see fresh state. Cheap
  // because there are usually zero subscribers when nothing is being dragged.
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
  // Sprite-sheet positioning: scale the atlas to fit the 32×32 box at the
  // frame's aspect, then offset so the frame's top-left lands at (0, 0).
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
```

- [ ] **Step 2 — Export from package index**

Edit `tools/preview/src/index.ts`. Append:

```ts
export {
  DragProvider,
  useDrag,
  useDragSource,
  useDragTarget,
  type DragPayload,
  type DragSourceKind,
  type DragState,
} from './dragKit'
```

- [ ] **Step 3 — Typecheck**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview typecheck
```

Expected: `Done`.

- [ ] **Step 4 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/dragKit.tsx tools/preview/src/index.ts && git commit -m "feat(preview): dragKit — shared drag context + floating thumbnail layer"
```

---

## Task 4 — `AnimationDrawer` shell + mount in App

**Files:**
- Create: `tools/preview/src/AnimationDrawer.tsx`
- Modify: `tools/vscode/webview/atlas/App.tsx`
- Modify: `tools/preview/src/index.ts`

This task lands the drawer chrome (collapsible header, top-edge resize splitter, body container) and wires it into the Atlas pane. The header content is a placeholder — Task 5 fills it in. The body is empty — Task 7 fills it in.

- [ ] **Step 1 — Create `AnimationDrawer.tsx`**

Create `tools/preview/src/AnimationDrawer.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'

export type AnimationDrawerDensity = 'detail' | 'dots' | 'collapsed'

const DENSITY_DETAIL_MIN_PX = 80
const DENSITY_DOTS_MIN_PX = 24
const DRAWER_MIN_PX = 24
const DRAWER_MAX_PX = 400

/** Pure helper — chosen by the resize handler and reflected to body. */
export function densityForHeight(heightPx: number): AnimationDrawerDensity {
  if (heightPx < DENSITY_DOTS_MIN_PX) return 'collapsed'
  if (heightPx < DENSITY_DETAIL_MIN_PX) return 'dots'
  return 'detail'
}

const s = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: vscode.panelBg,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: vscode.panelBorder,
  },
  resizeHandle: {
    height: 4,
    cursor: 'ns-resize',
    backgroundColor: { default: 'transparent', ':hover': vscode.focusRing },
    flexShrink: 0,
  },
  resizeHandleDragging: {
    backgroundColor: vscode.focusRing,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    paddingInline: space.md,
    paddingBlock: space.sm,
  },
})

export type AnimationDrawerProps = {
  /** Drawer expanded? Comes from prefs.animDrawerExpanded. */
  expanded: boolean
  /** Drawer body height in px when expanded. Comes from prefs.animDrawerHeight. */
  height: number
  /** Header content; always rendered (even when collapsed). */
  header: ReactNode
  /** Body content; rendered only when expanded. Receives current density. */
  body: (density: AnimationDrawerDensity) => ReactNode
  /** Caller persists the new height (debounced or immediate as they wish). */
  onHeightChange(nextHeight: number): void
}

/**
 * Collapsible drawer panel. Top-edge splitter resizes the body; chevron
 * inside the header (caller-provided) toggles `expanded`. Body density
 * derives from the current height — caller decides what to render.
 */
export function AnimationDrawer({ expanded, height, header, body, onHeightChange }: AnimationDrawerProps) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startHeight: height }
    setIsDragging(true)
  }, [height])
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    // Drawer grows as the splitter moves UP, so we subtract dy.
    const dy = e.clientY - dragRef.current.startY
    const next = Math.max(DRAWER_MIN_PX, Math.min(DRAWER_MAX_PX, dragRef.current.startHeight - dy))
    onHeightChange(next)
  }, [onHeightChange])
  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    dragRef.current = null
    setIsDragging(false)
  }, [])

  const density = expanded ? densityForHeight(height) : 'collapsed'

  return (
    <div {...stylex.props(s.shell)}>
      <div
        {...stylex.props(s.resizeHandle, isDragging && s.resizeHandleDragging)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden="true"
      />
      {header}
      {expanded ? (
        <div {...stylex.props(s.body)} style={{ height }}>
          {body(density)}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2 — Export from package index**

Edit `tools/preview/src/index.ts`. Append:

```ts
export {
  AnimationDrawer,
  densityForHeight,
  type AnimationDrawerProps,
  type AnimationDrawerDensity,
} from './AnimationDrawer'
```

- [ ] **Step 3 — Mount in App.tsx (placeholder header)**

Edit `tools/vscode/webview/atlas/App.tsx`. First, add the import next to the other `@three-flatland/preview` imports:

```ts
  AnimationDrawer,
```

Then find the `<Panel title="Atlas" headerActions={<AtlasMenu prefs={prefs} />}>` block. The current structure puts `<CanvasStage>...</CanvasStage>` inside `<div {...stylex.props(s.previewWrap)}>`. Wrap that whole `previewWrap` div + the new drawer in a vertical flex container:

```tsx
<Panel title="Atlas" headerActions={<AtlasMenu prefs={prefs} />}>
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
    <div {...stylex.props(s.previewWrap)} style={{ flex: 1, minHeight: 0 }}>
      <CanvasStage ...>
        ...existing children...
      </CanvasStage>
    </div>
    <AnimationDrawer
      expanded={prefs.animDrawerExpanded}
      height={prefs.animDrawerHeight}
      onHeightChange={(h) => prefsStore.set({ animDrawerHeight: h })}
      header={
        <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--vscode-panelTitle-activeForeground)' }}>
          <button
            type="button"
            onClick={() => prefsStore.set({ animDrawerExpanded: !prefs.animDrawerExpanded })}
            style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, marginRight: 6 }}
            aria-label={prefs.animDrawerExpanded ? 'Collapse animations' : 'Expand animations'}
          >
            {prefs.animDrawerExpanded ? '▼' : '▶'}
          </button>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            Animations (placeholder)
          </span>
        </div>
      }
      body={(density) => (
        <div style={{ color: 'var(--vscode-descriptionForeground)', fontFamily: 'monospace', fontSize: 10 }}>
          density: {density} · height: {prefs.animDrawerHeight}px (placeholder body — Task 7)
        </div>
      )}
    />
  </div>
</Panel>
```

The inline `style` props above are temporary — Task 5 replaces this header with the proper StyleX'd `<AnimationDrawerHeader />`.

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

Expected: typecheck `Done`, build emits `dist/webview/...` with no errors.

- [ ] **Step 5 — Manual smoke**

`F5` the extension host. Open a `.atlas.json` file. The Atlas pane should now have a thin border-top'd strip at the bottom with a `▶ ANIMATIONS (placeholder)` chevron. Click the chevron — body appears showing `density: detail · height: 140px`. Drag the 4px splitter at the top of the drawer up and down — height changes; density label updates (`detail` → `dots` → `collapsed`) as you cross the thresholds.

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationDrawer.tsx tools/preview/src/index.ts tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): AnimationDrawer shell — collapsible + resizable + density resolver"
```

---

## Task 5 — `AnimationDrawerHeader` chrome

**Files:**
- Create: `tools/preview/src/AnimationDrawerHeader.tsx`
- Modify: `tools/preview/src/index.ts`
- Modify: `tools/vscode/webview/atlas/App.tsx`

This task lands the header layout (chevron, label, dropdown, play, fps/loop/ping-pong chips, +new, ⋯) wired against caller-provided callbacks. The chips use `<select>`-style native elements for v1 — we'll iterate to popovers later if needed. Animation create/rename/delete handlers are stubbed in App; Task 6 makes them real.

- [ ] **Step 1 — Create the header component**

Create `tools/preview/src/AnimationDrawerHeader.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'

export type AnimationDrawerHeaderProps = {
  expanded: boolean
  onToggleExpanded(): void
  /** Animation names in the current sidecar. May be empty. */
  animationNames: readonly string[]
  /** Currently selected animation, or null when none exists. */
  activeAnimation: string | null
  onSelectAnimation(name: string): void
  /** Called on +new click. Caller seeds the new animation from current selection. */
  onCreateAnimation(): void
  /** Called on Delete in the ⋯ menu. */
  onDeleteAnimation(name: string): void
  /** Called on inline rename commit. */
  onRenameAnimation(oldName: string, newName: string): void
  /** Playback. */
  isPlaying: boolean
  onTogglePlay(): void
  /** Per-animation knobs. Disabled when no animation selected. */
  fps: number
  loop: boolean
  pingPong: boolean
  onChangeFps(next: number): void
  onChangeLoop(next: boolean): void
  onChangePingPong(next: boolean): void
}

const s = stylex.create({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingInline: space.md,
    paddingBlock: space.xs,
    color: vscode.fg,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    flexShrink: 0,
  },
  chev: {
    background: 'transparent',
    borderWidth: 0,
    color: vscode.panelTitleFg,
    cursor: 'pointer',
    padding: 0,
    width: 14,
    fontSize: '10px',
  },
  label: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: vscode.panelTitleFg,
  },
  select: {
    background: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    minWidth: 80,
  },
  renameInput: {
    background: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    width: 100,
    outlineWidth: 0,
  },
  chip: {
    background: vscode.bg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    cursor: 'pointer',
    userSelect: 'none',
  },
  chipOff: {
    opacity: 0.5,
  },
  chipDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  fpsField: {
    background: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    width: 50,
  },
  iconBtn: {
    background: 'transparent',
    color: vscode.fg,
    borderWidth: 0,
    borderRadius: radius.sm,
    paddingInline: space.xs,
    paddingBlock: '1px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: vscode.monoFontFamily,
  },
  iconBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  spacer: { flex: 1 },
})

export function AnimationDrawerHeader(props: AnimationDrawerHeaderProps) {
  const {
    expanded, onToggleExpanded,
    animationNames, activeAnimation,
    onSelectAnimation, onCreateAnimation, onDeleteAnimation, onRenameAnimation,
    isPlaying, onTogglePlay,
    fps, loop, pingPong,
    onChangeFps, onChangeLoop, onChangePingPong,
  } = props

  const hasActive = activeAnimation != null
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  const onRenameKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (renameDraft && activeAnimation && renameDraft !== activeAnimation && !animationNames.includes(renameDraft)) {
        onRenameAnimation(activeAnimation, renameDraft)
      }
      setRenameDraft(null)
    } else if (e.key === 'Escape') {
      setRenameDraft(null)
    }
  }

  return (
    <div {...stylex.props(s.bar)}>
      <button
        type="button"
        {...stylex.props(s.chev)}
        onClick={onToggleExpanded}
        aria-label={expanded ? 'Collapse animations' : 'Expand animations'}
      >
        {expanded ? '▼' : '▶'}
      </button>
      <span {...stylex.props(s.label)}>Animations</span>

      {animationNames.length === 0 ? (
        <span {...stylex.props(s.label)} style={{ opacity: 0.5 }}>(none)</span>
      ) : renameDraft != null ? (
        <input
          {...stylex.props(s.renameInput)}
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={() => setRenameDraft(null)}
          onKeyDown={onRenameKey}
        />
      ) : (
        <select
          {...stylex.props(s.select)}
          value={activeAnimation ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onSelectAnimation(e.target.value)}
          onDoubleClick={() => activeAnimation && setRenameDraft(activeAnimation)}
          title="Double-click to rename"
        >
          {animationNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}

      <button
        type="button"
        {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled)}
        onClick={hasActive ? onTogglePlay : undefined}
        disabled={!hasActive}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <input
        type="number"
        min={1}
        max={60}
        step={1}
        {...stylex.props(s.fpsField, !hasActive && s.chipDisabled)}
        value={fps}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChangeFps(Math.max(1, Math.min(60, Math.round(v))))
        }}
        disabled={!hasActive}
        title="Frames per second"
      />
      <span style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', marginLeft: -4 }}>fps</span>

      <button
        type="button"
        {...stylex.props(s.chip, !loop && s.chipOff, !hasActive && s.chipDisabled)}
        onClick={hasActive ? () => onChangeLoop(!loop) : undefined}
        disabled={!hasActive}
        title="Loop"
      >
        loop
      </button>
      <button
        type="button"
        {...stylex.props(s.chip, !pingPong && s.chipOff, !hasActive && s.chipDisabled)}
        onClick={hasActive ? () => onChangePingPong(!pingPong) : undefined}
        disabled={!hasActive}
        title="Ping-pong"
      >
        ↺
      </button>

      <span {...stylex.props(s.spacer)} />

      <button
        type="button"
        {...stylex.props(s.iconBtn)}
        onClick={onCreateAnimation}
        title="New animation"
      >
        ＋
      </button>
      <button
        type="button"
        {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled)}
        onClick={hasActive && activeAnimation ? () => {
          if (window.confirm(`Delete "${activeAnimation}"? This cannot be undone.`)) {
            onDeleteAnimation(activeAnimation)
          }
        } : undefined}
        disabled={!hasActive}
        title="Delete animation"
      >
        ⋯
      </button>
    </div>
  )
}
```

- [ ] **Step 2 — Export from package index**

Edit `tools/preview/src/index.ts`. Append:

```ts
export { AnimationDrawerHeader, type AnimationDrawerHeaderProps } from './AnimationDrawerHeader'
```

- [ ] **Step 3 — Replace placeholder header in App.tsx**

Edit `tools/vscode/webview/atlas/App.tsx`. Add to the import list from `@three-flatland/preview`:

```ts
  AnimationDrawerHeader,
```

Find the `<AnimationDrawer` block from Task 4. Replace its `header={...}` prop value with:

```tsx
  header={
    <AnimationDrawerHeader
      expanded={prefs.animDrawerExpanded}
      onToggleExpanded={() => prefsStore.set({ animDrawerExpanded: !prefs.animDrawerExpanded })}
      animationNames={[]}
      activeAnimation={null}
      onSelectAnimation={() => {}}
      onCreateAnimation={() => {}}
      onDeleteAnimation={() => {}}
      onRenameAnimation={() => {}}
      isPlaying={false}
      onTogglePlay={() => {}}
      fps={12}
      loop={true}
      pingPong={false}
      onChangeFps={() => {}}
      onChangeLoop={() => {}}
      onChangePingPong={() => {}}
    />
  }
```

(Task 6 wires these to real handlers.)

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

Expected: clean.

- [ ] **Step 5 — Manual smoke**

F5. Drawer header now shows: `▼ ANIMATIONS (none) ▶ [12] fps loop ↺` and `＋ ⋯` on the right. All controls disabled (no active animation). Click `▼` → toggles collapse. Resize splitter still works. Buttons render but do nothing yet.

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationDrawerHeader.tsx tools/preview/src/index.ts tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): AnimationDrawerHeader — chrome with dropdown, transport, fps/loop chips"
```

---

## Task 6 — Animations state in App + create/select/delete/rename

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`

This task adds the in-memory animation map, wires the drawer header callbacks, and persists animations as part of save. No timeline body yet — drawer just shows animation names in the dropdown and lets you select / create / rename / delete.

- [ ] **Step 1 — Add the type**

Near the top of `App.tsx` (after the existing `type Tool = ...` line), add:

```ts
type Animation = {
  /** Frame names in playback order. Duplicates encode hold counts. */
  frames: string[]
  fps: number
  loop: boolean
  pingPong: boolean
  events?: Record<string, string>
}
```

- [ ] **Step 2 — Add animation state**

Inside `export function App() {`, near the other `useState` calls, add:

```ts
  // Map of animation name → animation. Initialised from the sidecar
  // payload (Task 14 wires the payload reader); user edits via drawer.
  const [animations, setAnimations] = useState<Record<string, Animation>>({})
  const [activeAnimation, setActiveAnimation] = useState<string | null>(null)

  // Drawer auto-expands the first time the sidecar comes in with anims.
  const didAutoExpandRef = useRef(false)
  useEffect(() => {
    if (didAutoExpandRef.current) return
    if (Object.keys(animations).length === 0) return
    didAutoExpandRef.current = true
    if (!prefs.animDrawerExpanded) prefsStore.set({ animDrawerExpanded: true })
    if (activeAnimation == null) setActiveAnimation(Object.keys(animations)[0] ?? null)
  }, [animations, prefs.animDrawerExpanded, activeAnimation])
```

Make sure `useEffect` and `useRef` are in the React import at the top of the file.

- [ ] **Step 3 — Add handlers**

Inside the same component, after the `useEffect`, add these handlers:

```ts
  const animationNames = useMemo(() => Object.keys(animations).sort(), [animations])

  const handleCreateAnimation = useCallback(() => {
    // Use selected frames if any, else empty.
    const seedFrames = Array.from(selectedIds)
      .map((id) => rects.find((r) => r.id === id))
      .filter((r): r is Rect => r != null)
      .map((r) => r.name ?? '')
      .filter((n) => n.length > 0)

    // Default name: single-folder prefix, else anim_N.
    let name = 'anim_1'
    if (seedFrames.length > 0) {
      const prefixes = new Set(seedFrames.map((n) => n.replace(/_\d+$/, '')))
      if (prefixes.size === 1) {
        const prefix = [...prefixes][0]!
        if (prefix.length > 0 && !animations[prefix]) name = prefix
      }
    }
    if (animations[name]) {
      let i = 1
      while (animations[`anim_${i}`]) i++
      name = `anim_${i}`
    }
    setAnimations((prev) => ({
      ...prev,
      [name]: { frames: seedFrames, fps: 12, loop: true, pingPong: false },
    }))
    setActiveAnimation(name)
    if (!prefs.animDrawerExpanded) prefsStore.set({ animDrawerExpanded: true })
  }, [animations, prefs.animDrawerExpanded, rects, selectedIds])

  const handleDeleteAnimation = useCallback((name: string) => {
    setAnimations((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
    setActiveAnimation((cur) => (cur === name ? null : cur))
  }, [])

  const handleRenameAnimation = useCallback((oldName: string, newName: string) => {
    setAnimations((prev) => {
      if (!prev[oldName] || prev[newName]) return prev
      const next: Record<string, Animation> = {}
      for (const [k, v] of Object.entries(prev)) {
        next[k === oldName ? newName : k] = v
      }
      return next
    })
    setActiveAnimation((cur) => (cur === oldName ? newName : cur))
  }, [])

  const updateActiveAnimation = useCallback((patch: Partial<Animation>) => {
    setAnimations((prev) => {
      if (!activeAnimation || !prev[activeAnimation]) return prev
      return { ...prev, [activeAnimation]: { ...prev[activeAnimation], ...patch } }
    })
  }, [activeAnimation])

  const activeAnim = activeAnimation ? animations[activeAnimation] : null
```

- [ ] **Step 4 — Wire the header props**

Replace the placeholder `<AnimationDrawerHeader … />` (from Task 5) with the real wiring:

```tsx
  header={
    <AnimationDrawerHeader
      expanded={prefs.animDrawerExpanded}
      onToggleExpanded={() => prefsStore.set({ animDrawerExpanded: !prefs.animDrawerExpanded })}
      animationNames={animationNames}
      activeAnimation={activeAnimation}
      onSelectAnimation={setActiveAnimation}
      onCreateAnimation={handleCreateAnimation}
      onDeleteAnimation={handleDeleteAnimation}
      onRenameAnimation={handleRenameAnimation}
      isPlaying={false}
      onTogglePlay={() => {}}
      fps={activeAnim?.fps ?? 12}
      loop={activeAnim?.loop ?? true}
      pingPong={activeAnim?.pingPong ?? false}
      onChangeFps={(v) => updateActiveAnimation({ fps: v })}
      onChangeLoop={(v) => updateActiveAnimation({ loop: v })}
      onChangePingPong={(v) => updateActiveAnimation({ pingPong: v })}
    />
  }
```

(Play/pause stays stubbed until Task 9.)

- [ ] **Step 5 — Persist animations on save**

Find the `handleSave` function. It currently builds a sidecar object from `rects`. After the section that maps `rects` into the `frames` block, find `meta:` and add `animations` underneath the existing meta fields:

```ts
        ...(Object.keys(animations).length > 0
          ? {
              animations: Object.fromEntries(
                Object.entries(animations)
                  .filter(([, a]) => a.frames.length > 0) // strip empty
                  .map(([name, a]) => [name, {
                    frames: a.frames,
                    fps: a.fps,
                    loop: a.loop,
                    pingPong: a.pingPong,
                    ...(a.events ? { events: a.events } : {}),
                  }]),
              ),
            }
          : {}),
```

- [ ] **Step 6 — Read animations from the sidecar payload**

`InitPayload` contains `rects`. We need it to also bring `animations` so opens of an existing sidecar repopulate. Update the `InitPayload` type:

```ts
type InitPayload = {
  imageUri: string
  fileName: string
  rects?: readonly Rect[]
  animations?: Record<string, Animation>
  loadError?: string | null
}
```

Find the existing `useEffect` that processes `payload?.rects` — it calls `setRects`. Add a sibling effect (or extend it) to call `setAnimations(payload.animations ?? {})`:

```ts
  useEffect(() => {
    if (payload?.animations) setAnimations(payload.animations)
  }, [payload?.animations])
```

The host (`tools/vscode/src/atlas/AtlasCustomEditorProvider.ts` or equivalent) already passes `meta.animations` through to the webview if it exists in the sidecar — verify by searching for `animations` in `tools/vscode/src/`:

```bash
unset NODE_OPTIONS && grep -rn "animations" tools/vscode/src/
```

If the host doesn't currently forward animations, add them: locate the `webview.html` / `postMessage` site that ships `rects` and add `animations: doc.meta?.animations ?? null` alongside.

- [ ] **Step 7 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 8 — Manual smoke**

F5. Open an atlas with no animations. Drawer header shows `(none)`. Click `＋` — drawer auto-expands, dropdown shows `anim_1`, fps/loop/ping-pong chips become enabled. Click `＋` again — `anim_2` appears in the dropdown. Select `anim_1`, double-click the dropdown — inline rename input appears, type `idle` + Enter → renamed. Click `⋯` → confirm → animation removed. ⌘S — open the saved JSON; `meta.animations` block contains your animations.

- [ ] **Step 9 — Commit**

```bash
unset NODE_OPTIONS && git add tools/vscode/webview/atlas/App.tsx tools/vscode/src/ && git commit -m "feat(atlas): animations state — create/select/rename/delete + sidecar I/O"
```

---

## Task 7 — `AnimationTimeline` body (detail + dots)

**Files:**
- Create: `tools/preview/src/AnimationTimeline.tsx`
- Modify: `tools/preview/src/index.ts`
- Modify: `tools/vscode/webview/atlas/App.tsx`

This task lands the body view at both densities. No interactions yet (hold drag-edge in Task 8, reorder in Task 9, drop targets in Task 10). Cells render frame thumbnails via the same sprite-sheet trick used elsewhere in the project.

- [ ] **Step 1 — Create the component**

Create `tools/preview/src/AnimationTimeline.tsx`:

```tsx
import { useMemo } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'
import type { AnimationDrawerDensity } from './AnimationDrawer'

export type AnimationTimelineProps = {
  /** Frame names in playback order, with duplicates encoding hold counts. */
  frames: readonly string[]
  /**
   * All atlas rects, indexed by name for thumbnail lookup. The timeline
   * doesn't own rect identity; it just needs the rect geometry to draw
   * the sprite-sheet thumbnail.
   */
  ratlasByName: Record<string, Rect>
  atlasImageUri: string | null
  atlasSize: { w: number; h: number } | null
  density: AnimationDrawerDensity
  /** Current playhead index (group index — see `groupCells`). */
  playheadGroupIndex: number
  /** Click a cell to scrub the playhead there. */
  onSeekGroup(groupIndex: number): void
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

const CELL_BASE = 32
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
    background: 'rgba(0, 0, 0, 0.6)',
    color: vscode.fg,
    paddingInline: 3,
    borderRadius: radius.sm,
    fontSize: '8px',
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
    width: 'auto',
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
  },
})

export function AnimationTimeline({
  frames, ratlasByName, atlasImageUri, atlasSize,
  density, playheadGroupIndex, onSeekGroup,
}: AnimationTimelineProps) {
  const groups = useMemo(() => groupCells(frames), [frames])

  if (frames.length === 0) {
    return (
      <div {...stylex.props(s.empty)}>
        Select frames in the Frames panel and click + again to populate, or drag frames here.
      </div>
    )
  }

  if (density === 'collapsed') return null

  if (density === 'dots') {
    return (
      <div {...stylex.props(s.trackDots)}>
        {groups.map((g, idx) => (
          <span
            key={idx}
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
    <div {...stylex.props(s.trackDetail)}>
      {groups.map((g, idx) => {
        const rect = ratlasByName[g.name]
        const width = CELL_BASE + (g.count - 1) * CELL_HOLD_PER_DUP
        const bgStyle: React.CSSProperties = {}
        if (rect && atlasImageUri && atlasSize) {
          const scale = Math.min(CELL_BASE / rect.w, CELL_BASE / rect.h)
          bgStyle.backgroundImage = `url(${atlasImageUri})`
          bgStyle.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`
          bgStyle.backgroundPosition = `${-rect.x * scale}px ${-rect.y * scale}px`
        }
        return (
          <div
            key={idx}
            {...stylex.props(s.cell, idx === playheadGroupIndex && s.cellPlayhead)}
            style={{ width, ...bgStyle }}
            onClick={() => onSeekGroup(idx)}
            title={g.name}
          >
            {g.count > 1 ? <span {...stylex.props(s.badge)}>×{g.count}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2 — Export from package index**

```ts
export { AnimationTimeline, groupCells, type AnimationTimelineProps } from './AnimationTimeline'
```

- [ ] **Step 3 — Wire body in App.tsx**

Add to the `@three-flatland/preview` import list in App.tsx:

```ts
  AnimationTimeline,
```

Add a `useMemo` near the other animation handlers in App.tsx:

```ts
  const rectsByName = useMemo(() => {
    const out: Record<string, Rect> = {}
    for (const r of rects) if (r.name) out[r.name] = r
    return out
  }, [rects])
```

Replace the `body={(density) => …}` placeholder in the `<AnimationDrawer>` block with:

```tsx
  body={(density) => (
    <AnimationTimeline
      frames={activeAnim?.frames ?? []}
      ratlasByName={rectsByName}
      atlasImageUri={payload?.imageUri ?? null}
      atlasSize={imageSize}
      density={density}
      playheadGroupIndex={0}
      onSeekGroup={() => {}}
    />
  )}
```

(Playhead wiring lands in Task 9.)

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 5 — Manual smoke**

F5. Open an atlas with rects named (use the rect tool or a previously-saved sidecar with named frames). Click `＋` with no selection — empty animation, drawer body shows the empty hint. To populate without yet having drag-and-drop: open the saved JSON in another editor, manually add `meta.animations.test = { frames: ["frame_0","frame_1","frame_1","frame_2"], fps: 12, loop: true, pingPong: false }`, save, reopen the atlas. Drawer dropdown shows `test`; body in detail mode renders 3 cells (the middle one widened with `×2` badge). Drag the splitter down past 80px → density flips to dots; widened bar marks the hold. Click cells / dots — no behavior yet (placeholder onSeekGroup).

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationTimeline.tsx tools/preview/src/index.ts tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): AnimationTimeline body — detail + dots renderings, group cells by hold"
```

---

## Task 8 — Hold drag-edge gesture

**Files:**
- Modify: `tools/preview/src/AnimationTimeline.tsx`
- Modify: `tools/vscode/webview/atlas/App.tsx`

Add a 4px-wide grab strip at the right edge of each detail cell. Drag right-to-extend / left-to-shrink hold. Commit on pointerup. Number keys `1`–`9` set the active cell's hold.

- [ ] **Step 1 — Add the prop and edge gesture to `AnimationTimeline`**

Edit `tools/preview/src/AnimationTimeline.tsx`. Extend the props:

```ts
  /** Called with the new hold count for a group. */
  onChangeHold?(groupIndex: number, nextCount: number): void
```

Add a new style entry to the `stylex.create({...})` block:

```ts
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
```

Inside the `density === 'detail'` branch, replace the cell rendering JSX with a version that includes the grab handle and a drag ref:

```tsx
import { useRef } from 'react'
// (already imported useMemo; add useRef if not already)

// ...inside the component, near the top of the body:
  const dragRef = useRef<{ groupIndex: number; startX: number; startCount: number } | null>(null)

  const onEdgePointerDown = (groupIndex: number, count: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { groupIndex, startX: e.clientX, startCount: count }
  }
  const onEdgePointerMove = (_e: React.PointerEvent) => {
    // No live preview in v1 — kept as a no-op so the JSX prop is wired
    // and we can add preview state later without re-plumbing.
  }
  const onEdgePointerUp = (e: React.PointerEvent) => {
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
```

In the cell render (detail branch), replace the cell `<div>` with:

```tsx
  // V1: width updates on pointerup (no live preview during drag). Keeps
  // the gesture simple and matches RectOverlay's commit-on-pointerup
  // pattern. If users complain about lack of preview, add a state-driven
  // preview width here.
  const width = CELL_BASE + (g.count - 1) * CELL_HOLD_PER_DUP
  // ...
  <div
    key={idx}
    {...stylex.props(s.cell, idx === playheadGroupIndex && s.cellPlayhead)}
    style={{ width, ...bgStyle }}
    onClick={() => onSeekGroup(idx)}
    title={g.name}
  >
    {g.count > 1 ? <span {...stylex.props(s.badge)}>×{g.count}</span> : null}
    {onChangeHold ? (
      <div
        {...stylex.props(s.edgeGrab)}
        onPointerDown={onEdgePointerDown(idx, g.count)}
        onPointerMove={onEdgePointerMove}
        onPointerUp={onEdgePointerUp}
        onPointerCancel={() => { dragRef.current = null }}
      />
    ) : null}
  </div>
```

(Note: live width preview during drag isn't shown — commit-on-pointerup is the simpler v1 and matches how `RectOverlay` handles snapped resize. Iterate if the lack of preview bites in use.)

- [ ] **Step 2 — Wire `onChangeHold` in App.tsx**

Add a handler near the other animation handlers:

```ts
  const handleChangeHold = useCallback((groupIndex: number, nextCount: number) => {
    if (!activeAnimation) return
    setAnimations((prev) => {
      const anim = prev[activeAnimation]
      if (!anim) return prev
      const groups = (function group(frames: readonly string[]) {
        const out: { name: string; count: number }[] = []
        let i = 0
        while (i < frames.length) {
          const name = frames[i]!
          let j = i
          while (j < frames.length && frames[j] === name) j++
          out.push({ name, count: j - i })
          i = j
        }
        return out
      })(anim.frames)
      if (groupIndex < 0 || groupIndex >= groups.length) return prev
      groups[groupIndex] = { ...groups[groupIndex]!, count: nextCount }
      const nextFrames: string[] = []
      for (const g of groups) for (let k = 0; k < g.count; k++) nextFrames.push(g.name)
      return { ...prev, [activeAnimation]: { ...anim, frames: nextFrames } }
    })
  }, [activeAnimation])
```

Pass it through the timeline:

```tsx
  body={(density) => (
    <AnimationTimeline
      frames={activeAnim?.frames ?? []}
      ratlasByName={rectsByName}
      atlasImageUri={payload?.imageUri ?? null}
      atlasSize={imageSize}
      density={density}
      playheadGroupIndex={0}
      onSeekGroup={() => {}}
      onChangeHold={handleChangeHold}
    />
  )}
```

- [ ] **Step 3 — Number-key hold (1..9)**

Add a window-level keydown handler in App.tsx near the other keyboard handlers:

```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeAnimation) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const num = Number(e.key)
      if (!Number.isInteger(num) || num < 1 || num > 9) return
      // Apply to the cell at playhead position. Until the playhead is wired
      // (Task 9), this targets group 0 — Task 9 will replace `0` with the
      // playhead index from the animationStore.
      handleChangeHold(0, num)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeAnimation, handleChangeHold])
```

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 5 — Manual smoke**

F5. Open the test atlas. Hover the right edge of any detail cell — cursor changes to ew-resize, edge tints. Drag right ~16px → cell widens, badge becomes `×2` on release. Drag back → returns to base. Press number keys `1`-`9` while the drawer is focused — group 0's hold updates.

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationTimeline.tsx tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): timeline hold gesture — drag right edge + 1..9 keys"
```

---

## Task 9 — Playback (animationStore + rAF tick + transport wiring)

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`
- Modify: `tools/preview/src/AnimationTimeline.tsx` (playhead-to-group wiring)

- [ ] **Step 1 — Mount the animationStore in App.tsx**

Add to imports from `@three-flatland/preview`:

```ts
  createAnimationStore,
  useAnimationPlayback,
```

Inside `App()`, after other `useMemo` hooks:

```ts
  const animationStore = useMemo(() => createAnimationStore(), [])
  const playback = useAnimationPlayback(animationStore)

  // Sync activeAnimation to the store (one-way: app drives the store).
  useEffect(() => {
    if (playback.activeAnimation !== activeAnimation) {
      animationStore.setActive(activeAnimation)
    }
  }, [activeAnimation, animationStore, playback.activeAnimation])

  // rAF tick loop — only spins when isPlaying.
  useEffect(() => {
    if (!playback.isPlaying || !activeAnim) return
    let raf = 0
    let last = performance.now()
    const loop = (t: number) => {
      const dt = t - last
      last = t
      animationStore.tick(dt, activeAnim.frames.length, activeAnim.fps, activeAnim.loop, activeAnim.pingPong)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playback.isPlaying, activeAnim, animationStore])
```

- [ ] **Step 2 — Wire transport to header**

Update the header's `isPlaying` and `onTogglePlay` props:

```tsx
      isPlaying={playback.isPlaying}
      onTogglePlay={() => animationStore.togglePlay()}
```

- [ ] **Step 3 — Compute playhead group index**

In `AnimationTimeline.tsx`, export a tiny helper:

```ts
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
```

Add to the index export:

```ts
export { AnimationTimeline, groupCells, frameIndexToGroupIndex, type AnimationTimelineProps } from './AnimationTimeline'
```

- [ ] **Step 4 — Wire playhead through to body**

Add to App.tsx's preview imports:

```ts
  frameIndexToGroupIndex,
```

Update the timeline prop wiring:

```tsx
      playheadGroupIndex={frameIndexToGroupIndex(activeAnim?.frames ?? [], playback.playhead)}
      onSeekGroup={(g) => {
        const frames = activeAnim?.frames ?? []
        // Find the first frame in group g.
        let i = 0
        let cur = 0
        while (i < frames.length && cur < g) {
          const name = frames[i]!
          while (i < frames.length && frames[i] === name) i++
          cur++
        }
        animationStore.seek(i)
      }}
```

- [ ] **Step 5 — Update keyboard handler to target playhead group**

Replace the `handleChangeHold(0, num)` call from Task 8 with the playhead-aware version:

```ts
      const groupIdx = frameIndexToGroupIndex(activeAnim?.frames ?? [], playback.playhead)
      handleChangeHold(groupIdx, num)
```

Update the dep array of that effect to include `activeAnim` and `playback.playhead`.

- [ ] **Step 6 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 7 — Manual smoke**

F5. Test atlas with the manual-edit `meta.animations.test` from Task 7. Click `▶` in drawer header — playhead group highlights cycle through cells at the configured fps. Toggle loop / ping-pong chips — playback respects them (loop wraps; ping-pong bounces). Click a cell → playhead seeks there. Press `5` while a cell is the active group → its hold becomes 5.

- [ ] **Step 8 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationTimeline.tsx tools/preview/src/index.ts tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): playback — animationStore tick loop + transport wiring + playhead seek"
```

---

## Task 10 — `AnimationPreviewPip` floating window

**Files:**
- Create: `tools/preview/src/AnimationPreviewPip.tsx`
- Modify: `tools/preview/src/index.ts`
- Modify: `tools/vscode/webview/atlas/App.tsx`

- [ ] **Step 1 — Create the PIP component**

Create `tools/preview/src/AnimationPreviewPip.tsx`:

```tsx
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import type { Rect } from './RectOverlay'

export type PipCorner = 'tl' | 'tr' | 'br' | 'bl'

export type AnimationPreviewPipProps = {
  /** Active animation name; renders nothing when null. */
  animationName: string | null
  /** Frame names in playback order (with duplicates). */
  frames: readonly string[]
  /** Rect lookup for thumbnail positioning. */
  rectsByName: Record<string, Rect>
  atlasImageUri: string | null
  atlasSize: { w: number; h: number } | null
  /** Current playhead index (post-duplication). */
  playhead: number
  isPlaying: boolean
  onTogglePlay(): void
  /** Current corner; click anywhere = hop to next corner. */
  corner: PipCorner
  onChangeCorner(next: PipCorner): void
}

const CORNERS: PipCorner[] = ['tl', 'tr', 'br', 'bl']
function nextCorner(c: PipCorner): PipCorner {
  return CORNERS[(CORNERS.indexOf(c) + 1) % CORNERS.length]!
}

const PIP_SIZE = 120
const TRANSPORT_HEIGHT = 14

const s = stylex.create({
  shell: {
    position: 'absolute',
    width: PIP_SIZE,
    height: PIP_SIZE,
    backgroundColor: vscode.bg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    borderRadius: radius.sm,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    overflow: 'hidden',
    userSelect: 'none',
  },
  cornerTl: { top: space.lg, left: space.lg },
  cornerTr: { top: space.lg, right: space.lg },
  cornerBr: { bottom: space.lg, right: space.lg },
  cornerBl: { bottom: space.lg, left: space.lg },
  body: {
    flex: 1,
    backgroundColor: vscode.bg,
    backgroundImage:
      'conic-gradient(var(--vscode-editorWidget-background) 90deg, var(--vscode-editor-background) 0 180deg, var(--vscode-editorWidget-background) 0 270deg, var(--vscode-editor-background) 0)',
    backgroundSize: '12px 12px',
    backgroundRepeat: 'repeat, no-repeat',
    position: 'relative',
  },
  spritePane: {
    position: 'absolute',
    inset: 0,
    backgroundRepeat: 'no-repeat',
  },
  bar: {
    height: TRANSPORT_HEIGHT,
    paddingInline: space.sm,
    background: 'rgba(0, 0, 0, 0.55)',
    color: vscode.fg,
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    fontSize: '9px',
    fontFamily: vscode.monoFontFamily,
  },
  play: { color: vscode.focusRing, fontWeight: 700 },
  meta: { marginLeft: 'auto', opacity: 0.7 },
})

export function AnimationPreviewPip(props: AnimationPreviewPipProps) {
  const {
    animationName, frames, rectsByName, atlasImageUri, atlasSize,
    playhead, isPlaying, onTogglePlay,
    corner, onChangeCorner,
  } = props

  if (!animationName || frames.length === 0) return null

  const cornerStyle =
    corner === 'tl' ? s.cornerTl :
    corner === 'tr' ? s.cornerTr :
    corner === 'br' ? s.cornerBr : s.cornerBl

  const currentName = frames[Math.min(playhead, frames.length - 1)]!
  const rect = rectsByName[currentName]
  const innerSize = PIP_SIZE - TRANSPORT_HEIGHT - 2 // 2 = top/bottom border
  const spriteStyle: React.CSSProperties = {}
  if (rect && atlasImageUri && atlasSize) {
    const scale = Math.min(innerSize / rect.w, innerSize / rect.h)
    spriteStyle.backgroundImage = `url(${atlasImageUri})`
    spriteStyle.backgroundSize = `${atlasSize.w * scale}px ${atlasSize.h * scale}px`
    spriteStyle.backgroundPosition =
      `${(innerSize - rect.w * scale) / 2 - rect.x * scale}px ${(innerSize - rect.h * scale) / 2 - rect.y * scale}px`
  }

  return (
    <div
      {...stylex.props(s.shell, cornerStyle)}
      onClick={(e) => {
        // Click on transport buttons handles itself; corner-hop fires for
        // clicks anywhere else (including the sprite area).
        const target = e.target as HTMLElement
        if (target.closest('[data-pip-transport]')) return
        onChangeCorner(nextCorner(corner))
      }}
      title="Click to move corner"
    >
      <div {...stylex.props(s.body)}>
        <div {...stylex.props(s.spritePane)} style={spriteStyle} />
      </div>
      <div {...stylex.props(s.bar)}>
        <span
          data-pip-transport=""
          {...stylex.props(s.play)}
          onClick={(e) => { e.stopPropagation(); onTogglePlay() }}
          style={{ cursor: 'pointer' }}
        >
          {isPlaying ? '⏸' : '▶'}
        </span>
        <span>{animationName}</span>
        <span {...stylex.props(s.meta)}>{playhead + 1}/{frames.length}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 — Export**

```ts
export { AnimationPreviewPip, type AnimationPreviewPipProps, type PipCorner } from './AnimationPreviewPip'
```

- [ ] **Step 3 — Mount inside CanvasStage in App.tsx**

Add to preview imports:

```ts
  AnimationPreviewPip,
```

Inside the `<CanvasStage>` children list, after `<InfoPanel … />`, add:

```tsx
              <AnimationPreviewPip
                animationName={activeAnimation}
                frames={activeAnim?.frames ?? []}
                rectsByName={rectsByName}
                atlasImageUri={payload?.imageUri ?? null}
                atlasSize={imageSize}
                playhead={playback.playhead}
                isPlaying={playback.isPlaying}
                onTogglePlay={() => animationStore.togglePlay()}
                corner={prefs.animPipCorner}
                onChangeCorner={(c) => prefsStore.set({ animPipCorner: c })}
              />
```

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 5 — Manual smoke**

F5. Open atlas with `meta.animations.test` populated (manual edit per Task 7) and named rects matching the frame names. PIP appears in the bottom-right corner of the canvas. Click `▶` in PIP transport — preview cycles through frames; main drawer header `▶` button stays in sync. Click anywhere else on the PIP body — hops to the next corner (TL → TR → BR → BL). Edit a rect's geometry while preview plays — next frame reflects the new rect.

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationPreviewPip.tsx tools/preview/src/index.ts tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): AnimationPreviewPip — floating preview, click-to-hop, live rect edits"
```

---

## Task 11 — Frames panel: folder ⊞-all icon + folder selection visual

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`

The Frames panel groups frames by prefix using a `Collapsible`. We add an icon button to each group header that selects all frames in that group, and a visual treatment that gradients the selection and dims other groups' rows.

- [ ] **Step 1 — Add a `selectionMode` state**

Inside `App()`, add:

```ts
  const [selectionMode, setSelectionMode] = useState<'individual' | 'folder'>('individual')
  const [folderSelectGroupId, setFolderSelectGroupId] = useState<string | null>(null)
```

- [ ] **Step 2 — Find the Frames-panel group rendering code**

Search for the Collapsible group header rendering — likely a function like `renderFrameGroup` or inline JSX inside the `<Panel title="Frames">` block. Locate where the group's title is set.

```bash
unset NODE_OPTIONS && grep -n "Collapsible\|group\|prefix" tools/vscode/webview/atlas/App.tsx | head -20
```

- [ ] **Step 3 — Add the `⊞ all` icon button to each group header**

Inside the group header content (alongside the existing `<Badge>` for the count), add a button:

```tsx
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation()
    const groupRectIds = new Set(group.rects.map((r) => r.id))
    setSelectedIds(groupRectIds)
    setSelectionMode('folder')
    setFolderSelectGroupId(group.prefix)
  }}
  style={{
    background: folderSelectGroupId === group.prefix ? 'rgba(108, 200, 255, 0.15)' : 'transparent',
    color: folderSelectGroupId === group.prefix ? '#6cf' : 'var(--vscode-descriptionForeground)',
    border: '1px solid',
    borderColor: folderSelectGroupId === group.prefix ? '#6cf' : 'var(--vscode-input-border)',
    borderRadius: 2,
    padding: '0 4px',
    fontSize: 9,
    fontFamily: 'monospace',
    cursor: 'pointer',
  }}
  title="Select all in folder"
>
  ⊞ all
</button>
```

(Replace `group.rects` / `group.prefix` with your existing local variable names.)

- [ ] **Step 4 — Apply gradient highlight + dim treatment to rows**

Locate where individual frame rows render (inside `group.rects.map((r) => …)` or similar). Compute a per-row treatment:

```tsx
const isFolderSelected = selectionMode === 'folder' && folderSelectGroupId === group.prefix
const isIndivSelected = selectionMode === 'individual' && selectedIds.has(r.id)
const dim = selectionMode === 'folder' && folderSelectGroupId !== group.prefix
const indexInGroup = group.rects.indexOf(r)
const gradHue = isFolderSelected
  ? `hsl(${130 + indexInGroup * (140 / Math.max(1, group.rects.length - 1))}, 60%, 55%)`
  : null

// Apply to the row's outer wrapper:
<div
  style={{
    opacity: dim ? 0.35 : 1,
    background: isIndivSelected
      ? 'rgba(255, 204, 0, 0.12)'
      : isFolderSelected
        ? `${gradHue!.replace(', 60%, 55%', ', 60%, 55%, 0.12')}`
        : 'transparent',
    borderLeft: isFolderSelected ? `2px solid ${gradHue}` : '2px solid transparent',
    transition: 'opacity 0.15s, background 0.15s',
  }}
>
  ...existing row content...
</div>
```

- [ ] **Step 5 — Reset to individual when user clicks a row**

Wherever row clicks set `selectedIds`, also clear the folder mode:

```ts
setSelectionMode('individual')
setFolderSelectGroupId(null)
```

Same when `selectedIds` is cleared from elsewhere (background-click deselect in CanvasStage, etc.) — consider adding an effect:

```ts
useEffect(() => {
  if (selectionMode === 'folder' && selectedIds.size === 0) {
    setSelectionMode('individual')
    setFolderSelectGroupId(null)
  }
}, [selectedIds, selectionMode])
```

- [ ] **Step 6 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 7 — Manual smoke**

F5. Frames panel groups now show `⊞ all` next to the count badge. Click on a group's `⊞ all` button — every frame in that group gets a green-to-violet gradient left-border + tinted background; frames in other groups dim to 35%. Click a single frame in another group — folder selection clears, individual selection takes over. Click empty space in canvas — deselect; folder mode also resets.

- [ ] **Step 8 — Commit**

```bash
unset NODE_OPTIONS && git add tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): Frames panel folder-select-all icon + gradient highlight + dim others"
```

---

## Task 12 — Drag from Frames panel + Add-to-anim button

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`
- Modify: `tools/preview/src/AnimationTimeline.tsx`

This task wires the Frames panel icon as a `dragKit` source AND adds the Add-to-anim button in the Frames panel header that inserts the current selection at the playhead. It also adds drop-target behavior to the timeline and to the drawer body.

- [ ] **Step 1 — Mount `DragProvider` at App root**

Add to preview imports in App.tsx:

```ts
  DragProvider,
  useDragSource,
  useDragTarget,
```

Wrap the entire returned JSX of App in `<DragProvider>`:

```tsx
return (
  <DragProvider>
    {/* existing root <div ref={rootRef} ...> */}
  </DragProvider>
)
```

- [ ] **Step 2 — Make Frames panel icons drag sources**

Find where each frame-row icon renders (the small thumbnail). Wrap it (or its containing element) with a pointerdown handler that uses `useDragSource`:

```tsx
const startDrag = useDragSource()

// In the row render:
<div
  onPointerDown={(e) => {
    if (e.button !== 0 || !payload?.imageUri || !imageSize || !r.name) return
    startDrag(e, {
      payload: { kind: 'frames-panel', frameName: r.name },
      atlasImageUri: payload.imageUri,
      atlasFrame: { x: r.x, y: r.y, w: r.w, h: r.h },
      atlasSize: { w: imageSize.w, h: imageSize.h },
    })
  }}
  // existing icon styling
/>
```

(Only the icon element gets the pointerdown — not the whole row — per the spec.)

- [ ] **Step 3 — Add "Add to anim" button to Frames panel header**

In the Frames `<Panel headerActions={...}>` slot (or equivalent header area), add:

```tsx
<button
  type="button"
  disabled={selectedIds.size === 0 || !activeAnimation}
  onClick={() => {
    if (!activeAnimation) return
    const selectedNames = Array.from(selectedIds)
      .map((id) => rects.find((r) => r.id === id))
      .filter((r): r is Rect => r != null)
      .map((r) => r.name ?? '')
      .filter((n) => n.length > 0)
    if (selectedNames.length === 0) return
    setAnimations((prev) => {
      const anim = prev[activeAnimation]
      if (!anim) return prev
      // Insert at playhead — find frame index from group-position later.
      // For v1 insert at end; Task 13 makes it cursor-aware.
      const nextFrames = [...anim.frames, ...selectedNames]
      return { ...prev, [activeAnimation]: { ...anim, frames: nextFrames } }
    })
  }}
  title={activeAnimation ? `Add ${selectedIds.size} frame(s) to ${activeAnimation}` : 'Select an animation first'}
  style={{
    background: 'transparent',
    border: '1px solid var(--vscode-input-border)',
    color: 'var(--vscode-foreground)',
    borderRadius: 2,
    padding: '0 4px',
    fontSize: 10,
    cursor: selectedIds.size > 0 && activeAnimation ? 'pointer' : 'not-allowed',
    opacity: selectedIds.size > 0 && activeAnimation ? 1 : 0.4,
  }}
>
  ＋ anim
</button>
```

- [ ] **Step 4 — Make AnimationTimeline a drop target**

Edit `tools/preview/src/AnimationTimeline.tsx`. Extend props:

```ts
  /**
   * Called when a frame is dropped on the timeline. `index` is the
   * frame-array insertion point (0 = before first frame, frames.length
   * = after last). Caller inserts the frameName at that index.
   */
  onDropFrame?(insertIndex: number, frameName: string): void
```

Import `useDragTarget` from `./dragKit`:

```ts
import { useDragTarget } from './dragKit'
```

Inside the component, register a target on the track div:

```tsx
const dropTarget = useDragTarget({
  accept: ['frames-panel', 'canvas-rect'],
  onDrop: (payload) => {
    onDropFrame?.(frames.length, payload.frameName)
  },
})
```

Spread the handlers onto the track div:

```tsx
<div {...stylex.props(s.trackDetail)} {...dropTarget}>
```

(Per-cell insertion-gap targets land in Task 13; v1 appends to the end.)

- [ ] **Step 5 — Wire `onDropFrame` in App.tsx**

```ts
const handleDropFrame = useCallback((insertIndex: number, frameName: string) => {
  if (!activeAnimation) return
  setAnimations((prev) => {
    const anim = prev[activeAnimation]
    if (!anim) return prev
    const next = [...anim.frames]
    next.splice(insertIndex, 0, frameName)
    return { ...prev, [activeAnimation]: { ...anim, frames: next } }
  })
}, [activeAnimation])
```

Pass through:

```tsx
  onDropFrame={handleDropFrame}
```

- [ ] **Step 6 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 7 — Manual smoke**

F5. Open atlas with named frames + an active animation. Drag a frame icon from the Frames panel — floating thumbnail follows cursor with the panel's gray border. Release over the timeline — frame appended; cell appears. Select multiple frames + click `＋ anim` in Frames header — all selected appended. Verify the floating element shows the correct sprite.

- [ ] **Step 8 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationTimeline.tsx tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): Frames panel icon drag + Add-to-anim button + timeline drop target"
```

---

## Task 13 — Canvas rect Alt+drag-as-frame source

**Files:**
- Modify: `tools/preview/src/RectOverlay.tsx`

- [ ] **Step 1 — Add the source hook**

Add to the imports at the top of RectOverlay.tsx:

```ts
import { useDragSource } from './dragKit'
```

The component receives `rects`, `imageW`, `imageH` already (via `viewport`). It needs the atlas image URI to start drags — add an optional prop:

```ts
  /** Atlas image URI — required to enable Alt+drag-as-frame. */
  atlasImageUri?: string | null
```

- [ ] **Step 2 — Wire Alt+drag detection in `handleRectPointerDown`**

Find the `handleRectPointerDown` function. At the top, add:

```ts
const startFrameDrag = useDragSource()
```

(Note: hooks must be at the top level of the component — actually move this declaration to the component body, not the handler. Add it next to the other hook calls.)

Then in `handleRectPointerDown`, before the selection / move-drag logic, add:

```ts
if (e.altKey && r.name && atlasImageUri && vp) {
  e.stopPropagation()
  startFrameDrag(e, {
    payload: { kind: 'canvas-rect', frameName: r.name },
    atlasImageUri,
    atlasFrame: { x: r.x, y: r.y, w: r.w, h: r.h },
    atlasSize: { w: vp.imageW, h: vp.imageH },
  })
  return
}
```

- [ ] **Step 3 — Pass the image URI from App.tsx**

In App.tsx, find `<RectOverlay ... />` and add:

```tsx
  atlasImageUri={payload?.imageUri ?? null}
```

- [ ] **Step 4 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 5 — Manual smoke**

F5. Open atlas with named rects and an active animation. Hold Alt + drag a rect from the canvas — floating thumbnail follows cursor with yellow border (matches selected-rect accent). Drop on timeline — frame appended. Plain drag still does move-rect.

- [ ] **Step 6 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/RectOverlay.tsx tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): canvas rects support Alt+drag-as-frame via dragKit"
```

---

## Task 14 — Polish + final wiring + frame rename/delete propagation

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`
- Modify: `tools/preview/src/AnimationTimeline.tsx` (cell remove)

Final pass: empty animation warning, frame rename propagation, frame delete propagation, cell remove via Backspace, "Add to anim at playhead" (replace the v1 append-at-end), drawer remembers last height correctly.

- [ ] **Step 1 — Frame rename propagation**

Find the rename handler (the one that updates `rects` with a new `name`). After it commits the rename, also update animations:

```ts
// inside handleFrameRename or equivalent, after setRects(...):
setAnimations((prev) => {
  const next: Record<string, Animation> = {}
  for (const [k, anim] of Object.entries(prev)) {
    next[k] = { ...anim, frames: anim.frames.map((f) => f === oldName ? newName : f) }
  }
  return next
})
```

- [ ] **Step 2 — Frame delete propagation**

Find the rect-delete handler (the one that removes a rect). After `setRects`, prune from animations:

```ts
const removedNames = new Set(removedRects.map((r) => r.name).filter((n): n is string => n != null))
setAnimations((prev) => {
  const next: Record<string, Animation> = {}
  for (const [k, anim] of Object.entries(prev)) {
    next[k] = { ...anim, frames: anim.frames.filter((f) => !removedNames.has(f)) }
  }
  return next
})
```

- [ ] **Step 3 — Empty-animation warning chip in header**

Edit `AnimationDrawerHeader.tsx`. Add a prop:

```ts
  /** Names of animations that currently have zero frames. */
  emptyAnimations?: readonly string[]
```

Inside the header, after the dropdown, conditionally render a warning chip when `activeAnimation` is in `emptyAnimations`:

```tsx
{activeAnimation && emptyAnimations?.includes(activeAnimation) ? (
  <span
    title="Empty — will be stripped on save"
    style={{
      background: vscode.errorBg,
      color: vscode.errorFg,
      paddingInline: 5,
      paddingBlock: '1px',
      borderRadius: 2,
      fontSize: '10px',
    }}
  >
    empty
  </span>
) : null}
```

(Use the inline style here — token names already imported. If the build complains about the inline style mixing, fold it into a `stylex.create` entry.)

In App.tsx, compute and pass:

```tsx
  emptyAnimations={Object.entries(animations).filter(([, a]) => a.frames.length === 0).map(([k]) => k)}
```

- [ ] **Step 4 — Cell remove via Backspace**

In `AnimationTimeline.tsx`, add an `onRemoveGroup?(groupIndex: number): void` prop. Add cell selection state (single cell at a time):

```ts
const [selectedGroup, setSelectedGroup] = useState<number | null>(null)

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return
    if (selectedGroup == null) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    onRemoveGroup?.(selectedGroup)
    setSelectedGroup(null)
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [selectedGroup, onRemoveGroup])
```

Selecting a cell: change the cell `onClick` to also `setSelectedGroup(idx)`. Add a visual distinguisher for selected cells (e.g., `borderColor: vscode.focusRing` already shared with playhead — use a different style or stack them).

In App.tsx:

```ts
const handleRemoveGroup = useCallback((groupIndex: number) => {
  if (!activeAnimation) return
  setAnimations((prev) => {
    const anim = prev[activeAnimation]
    if (!anim) return prev
    const groups = groupCells(anim.frames)
    if (groupIndex < 0 || groupIndex >= groups.length) return prev
    groups.splice(groupIndex, 1)
    const nextFrames: string[] = []
    for (const g of groups) for (let k = 0; k < g.count; k++) nextFrames.push(g.name)
    return { ...prev, [activeAnimation]: { ...anim, frames: nextFrames } }
  })
}, [activeAnimation])
```

(Import `groupCells` from `@three-flatland/preview` at the top.)

Pass through:

```tsx
  onRemoveGroup={handleRemoveGroup}
```

- [ ] **Step 5 — "Add to anim at playhead" (replace append)**

Update the Add-to-anim button click handler from Task 12. Replace the append-at-end with a playhead-aware insert:

```ts
const insertIdx = playback.playhead
setAnimations((prev) => {
  const anim = prev[activeAnimation]
  if (!anim) return prev
  const next = [...anim.frames]
  next.splice(insertIdx, 0, ...selectedNames)
  return { ...prev, [activeAnimation]: { ...anim, frames: next } }
})
```

- [ ] **Step 6 — Typecheck + build**

```bash
unset NODE_OPTIONS && pnpm -F @three-flatland/preview -F @three-flatland/vscode typecheck && pnpm -F @three-flatland/vscode build
```

- [ ] **Step 7 — Final manual smoke**

F5. Walk the full flow:

1. Open atlas with no animations — drawer collapsed, header shows `(none)`.
2. Click `＋` — `anim_1` created, drawer expanded.
3. Select all in a folder via `⊞ all` — folder gradient highlight + others dim.
4. Click `＋` again — new animation `<folder-prefix>` populated with those frames.
5. Drag a frame from Frames panel → drops on timeline → cell appears.
6. Alt+drag a rect from canvas → drops on timeline → cell appears.
7. Drag right edge of cell → hold extends, badge updates on release.
8. Click a cell → playhead seeks; Backspace → cell removed.
9. Click ▶ → playback cycles; PIP plays in BR corner; click PIP body → hops corners.
10. Toggle loop / ping-pong → behavior matches.
11. Edit a rect's geometry while playing → next preview frame uses the new rect.
12. Rename a frame in Frames panel → animation references update.
13. Delete a rect → animation references stripped; if anim becomes empty, warning chip appears.
14. ⌘S — open the saved JSON, verify `meta.animations` block is correct (no empty animations included).
15. Reopen the file — animations restored, drawer auto-expanded.

- [ ] **Step 8 — Commit**

```bash
unset NODE_OPTIONS && git add tools/preview/src/AnimationTimeline.tsx tools/preview/src/AnimationDrawerHeader.tsx tools/vscode/webview/atlas/App.tsx && git commit -m "feat(atlas): polish — propagate rename/delete, empty-anim chip, cell remove, playhead-aware add"
```

---

## Out of scope (intentionally deferred)

- **Cell drag-to-reorder via dragKit** (`timeline-cell` source kind). The dragKit infrastructure is already in place. Add when a real workflow demand arises — cells can be removed + re-added at the playhead today, which covers the common case.
- **Insertion-gap drop indicators** between cells. The drop currently appends; reorder isn't supported (above). Add together when both land.
- **Rich events UI** beyond the schema-level data path (we save events but no UI to author them yet).
- **Drawer/PIP fade in pan mode** — iterate if it bites.
- **fps NumberField popover** — current `<input type="number">` works; replace with `NumberField` primitive if styling consistency demands it.

---

## Self-review notes

Spec → plan coverage:
- **Layout (drawer in Atlas pane peer of canvas)** → Tasks 4, 5
- **Floating PIP, click-to-hop corners** → Task 10
- **Three densities auto from height** → Tasks 4 (`densityForHeight`), 7 (renderings)
- **Workflow: create with folder selection** → Tasks 6 (handler), 11 (folder-select-all UI)
- **Workflow: drag frames + Add-to-anim button** → Task 12
- **Workflow: Alt+drag canvas rects** → Task 13
- **Workflow: hold drag-edge + 1..9 keys** → Task 8
- **Workflow: rename, delete anims** → Task 6
- **Drag system shared kit** → Tasks 3, 12, 13
- **fps/loop/ping-pong chips** → Task 5
- **Live preview reads live rects** → Task 10 (PIP reads `rectsByName` from App, which always reflects the current `rects` array)
- **Frame rename / delete propagation** → Task 14
- **Empty-animation warning chip** → Task 14
- **Sidecar I/O (existing schema)** → Task 6
- **Prefs additions** → Task 1
