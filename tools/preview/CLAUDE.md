# @three-flatland/preview

> Agent-facing reference for shared editor-tool UI primitives.

## Two entry points

- `@three-flatland/preview` — root: light, no R3F/three deps pulled in unless you ask.
  Exports: types, hooks, helpers, drag kit, animation timeline/drawer, etc.
- `@three-flatland/preview/canvas` — heavyweight: pulls in `@react-three/fiber` + `three`.
  Exports: `CanvasStage`, `ThreeLayer`, `AnimationPreviewPip`, `SpritePreview`.
  **Always** lazy-load (`React.lazy(() => import('@three-flatland/preview/canvas'))`) and warm
  the chunk in `main.tsx` with `void import('@three-flatland/preview/canvas')`. Importing this
  subpath at the top level of any module pulls three.js + R3F into the initial shell chunk,
  which balloons it from ~30 KB to >1 MB. See `tools/vscode/CLAUDE.md` "Bundle size & loading"
  for the canonical pattern (Suspense boundaries, FOUC guard, chunk warm-up).

`tools/preview/package.json` ships `"sideEffects": false`, so unused exports tree-shake out of
consumers — never write a side-effect at module top level here.

Source of truth: `tools/preview/package.json` (exports map), `tools/preview/src/index.ts`
(root surface), `tools/preview/src/canvas.ts` (canvas subpath surface).

## Reusable primitives

| Export | What it is | Where it fits |
|--------|------------|---------------|
| `CanvasStage` | Pan/zoom + three.js wrapper for ONE image | Single-image editors |
| `ThreeLayer` | Raw R3F canvas inside CanvasStage | Internal; use CanvasStage |
| `AnimationPreviewPip` | Floating animation preview window | Inside CanvasStage |
| `SpritePreview` | Single-frame sprite in an R3F scene | Inside ThreeLayer |
| `RectOverlay` | Interactive rect editor on a CanvasStage | Single-image editors |
| `Viewport` | **TYPE** describing pan/zoom state | Type-level only — NOT a component |
| `viewBoxFor(vp)` | Compute SVG `viewBox` string from a Viewport | SVG overlays sharing CanvasStage's pan/zoom |
| `ViewportContext` | React context carrying the current Viewport | Advanced: manual context access |
| `useViewport()` | Hook reading the current Viewport context | SVG overlays inside CanvasStage |
| `useViewportController()` | Hook returning zoom/pan imperatives | Toolbar zoom buttons |
| `useImageData()` | Hook reading the decoded ImageData | Pixel-level tools inside CanvasStage |
| `useCursorStore()` | Hook reading the CanvasStage cursor store | Reading cursor position/RGBA |
| `InfoPanel` | Floating cursor/coord/color readout | Inside CanvasStage as a child |
| `HoverFrameChip` | Hover label for a hovered rect | Inside CanvasStage as a child |
| `GridSliceOverlay` | Grid-slice rect-picking UI | Atlas slice tool |
| `AutoDetectOverlay` | Auto-detected rect-picking UI | Atlas auto-detect tool |
| `AnimationDrawer` | Collapsible drawer (header + body slots) | Layout primitive — not a playback widget |
| `AnimationDrawerHeader` | Atlas-specific drawer title bar | Pair with AnimationDrawer in atlas tool |
| `AnimationTimeline` | Frame timeline with scrubber | Inside AnimationDrawer body |
| `AnimationRectHighlight` | Highlights active animation frame on canvas | Inside CanvasStage overlay |
| `createAnimationStore` | Factory: playback store instance | Per-tool, created once |
| `useAnimationPlayback(store)` | Hook: subscribe to playback state | Any component needing playback snapshot |
| `advancePlayhead(...)` | Pure helper: compute next frame | External rAF tick loop |
| `DragProvider` | Context root for drag/drop | Wrap tool root |
| `useDragSource()` | Hook: returns a pointerdown drag-start handler | Draggable elements |
| `useDragTarget(opts)` | Hook: returns spread-able pointer handlers | Drop zones |
| `useDrag()` | Hook: raw DragApi (throws if no provider) | Low-level drag state |
| `createCursorStore` / `useCursor` | Cursor store outside CanvasStage scope | Custom canvas surfaces |
| `connectedComponents` | ImageData → connected-component bounding boxes | Auto-detect implementation |
| `canvasBackgroundStyle` | Style helper for checker/gradient/solid bg | CanvasStage `backgroundStyle` |
| `cellExtent` / `cellKey` / `gridFromCellSize` / `gridFromRowCol` | Grid math helpers | Grid slice tool |
| `computeThumbStyle(uri, imgW, imgH, rect, boxW, boxH)` | CSS for a clipped sprite-sheet thumbnail | Frames panel, drag preview, animation timeline |

### Sprite-sheet thumbnails — clip + chrome

`computeThumbStyle()` returns `{ bgImage, bgSize, bgPos, clip }`. Apply with a fixed-size **outer chrome** (border, bg, hover state) and an **inner span** (`position: absolute; inset: 0`) carrying the bg-image + clip-path:

```tsx
<span style={{ width: BOX, height: BOX, position: 'relative', overflow: 'hidden', border: ... }}>
  <span style={{ position: 'absolute', inset: 0,
                 backgroundImage: t.bgImage, backgroundSize: t.bgSize,
                 backgroundPosition: t.bgPos, clipPath: t.clip,
                 backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' }} />
</span>
```

The `clip-path` is what stops neighboring atlas tiles bleeding into a non-square frame's letterbox margins. Applying clip to the same element as the border crops the border too — always nest.

## Key API contracts — the surprising ones

### `Viewport` is a type, not a component

```ts
// tools/preview/src/Viewport.ts
export type Viewport = {
  imageW: number
  imageH: number
  fitMargin: number
  zoom: number   // 1 = fit-to-canvas; range [0.05, 50]
  panX: number   // image-pixel units from center; 0 = centered
  panY: number
}
```

Pan/zoom is owned by `CanvasStage`. For SVG overlays sharing CanvasStage's pan/zoom,
get the live viewport via `useViewport()` and compute the viewBox with `viewBoxFor(vp)`.
**Do not write `<Viewport>` — it is not renderable.**

```ts
// Correct pattern inside a CanvasStage child:
const vp = useViewport()  // Viewport | null
if (!vp) return null
return <svg viewBox={viewBoxFor(vp)} ...>
```

### `RectOverlay` is interactive + single-color + single-image scope

```ts
// tools/preview/src/RectOverlay.tsx
type RectOverlayProps = {
  rects: readonly Rect[]
  drawEnabled: boolean           // required; enables click-drag creation
  color?: string                 // ONE color for ALL non-selected rects
  draftColor?: string
  selectedColor?: string
  selectedIds?: ReadonlySet<string>
  onSelectionChange?: (ids: Set<string>) => void
  onRectCreate?: (rect: Rect) => void
  onRectChange?: (id: string, next: { x; y; w; h }) => void
  snapStep?: number              // snap to grid (0 = off)
  showLabels?: boolean
  interactive?: boolean
  onHoverChange?: (rect: Rect | null) => void
  atlasImageUri?: string | null  // enables Alt+drag-as-frame via dragKit
  atlasSize?: { w; h } | null
}
```

**No per-rect color or stroke prop.** If you need to highlight individual rects with
different colors (e.g., conflict markers in a merge tool), `RectOverlay` won't do it —
write a plain SVG `<rect>` loop over your data instead.

`RectOverlay` must be a child of `CanvasStage` (it calls `useViewport()` internally and
returns `null` if the context is absent).

### `CanvasStage` is single-image

Takes exactly one `imageUri`. For multi-image scenes (e.g., a merge tool showing two
source atlases side by side), do NOT mount multiple CanvasStages — build a hand-rolled
SVG or HTML layout with `<image>`/`<img>` elements. CanvasStage also owns the
`ViewportContext`, `CursorStoreContext`, `ImageDataContext`, and
`ViewportControllerContext` — these are only available to its children.

Key props:
```ts
type CanvasStageProps = {
  imageUri: string | null
  background?: string
  fitMargin?: number            // default 1.15 — image occupies 1/fitMargin of view
  children?: ReactNode          // SVG overlays, InfoPanel, etc.
  onImageReady?: (size: { w; h }) => void
  panMode?: boolean             // grab/pan captures all pointer events
  onSpaceHold?: (down: boolean) => void
  backgroundStyle?: 'solid' | 'checker' | 'gradient'
  dimOutOfBounds?: boolean
  onBackgroundPointerDown?: () => void
  pixelSnapZoom?: boolean
  pixelArt?: boolean
}
```

### `AnimationDrawer` is a layout primitive

```ts
// tools/preview/src/AnimationDrawer.tsx
type AnimationDrawerProps = {
  expanded: boolean
  header: ReactNode
  body: (density: AnimationDrawerDensity) => ReactNode
}
// AnimationDrawerDensity = 'detail' | 'collapsed'
// densityForHeight() always returns 'detail' (kept for back-compat only)
```

`AnimationDrawer` renders a collapsible shell: 1px border line, a header slot (always
visible), and a fixed-height body slot (48 px, only when `expanded`). It carries no
atlas data, no playback state, no timeline — the caller composes those manually.

`AnimationDrawerHeader` is atlas-tool-specific: it accepts animation names, fps, loop,
ping-pong, play/pause, PIP toggle, create/delete/rename callbacks. It is not a generic
"any tool" header — if building a different tool's drawer, write your own header and pass
it as the `header` prop to `AnimationDrawer`.

### Animation playback: store + rAF loop

Playback is externally driven. The pattern:

```ts
// Create once (useMemo or module-level):
const store = createAnimationStore()

// Subscribe in any component:
const { isPlaying, playhead, activeAnimation } = useAnimationPlayback(store)

// Drive from a rAF loop (useEffect in the tool's root):
useEffect(() => {
  if (!isPlaying) return
  let prev = performance.now()
  let raf: number
  const tick = (now: number) => {
    store.tick(now - prev, frameCount, fps, loop, pingPong)
    prev = now
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}, [isPlaying, store, frameCount, fps, loop, pingPong])
```

`advancePlayhead` is a pure helper exposed for testing or building custom tick logic.
`store.getSmoothPlayhead()` returns a sub-frame float for smooth scrubber indicators.

### `dragKit` is generic

Wrap your tool root in `<DragProvider>`, then:

```ts
// Source element:
const startDrag = useDragSource()
// onPointerDown:
startDrag(e, { payload: { kind, frameNames }, atlasImageUri, atlasFrames, atlasSize })

// Drop target:
const handlers = useDragTarget({ accept: ['canvas-rect'], onDrop(payload) { ... } })
<div {...handlers} />
```

`DragSourceKind` = `'frames-panel' | 'canvas-rect' | 'timeline-cell'`.
The `DragProvider` renders a floating thumbnail layer automatically — no extra work
needed for the drag visual.

`useDragSource()` and `useDragTarget()` silently no-op when no `DragProvider` ancestor
is present (safe to call unconditionally in reusable primitives).

## What is atlas-tool-specific

These exports exist in the package but are wired to the atlas tool's data model —
they require atlas sidecar data and are not generic reusable primitives:

- `AnimationDrawerHeader` — props match atlas sidecar shape exactly.
- `GridSliceOverlay` — picks cells for atlas frame extraction.
- `AutoDetectOverlay` — runs CCL and presents detected rects for atlas import.
- `AnimationRectHighlight` — highlights the active animation frame within an atlas.

For a non-atlas tool, use `AnimationDrawer` + your own header, and build your own
overlays as SVG children of `CanvasStage`.

## Reference usage

- Full atlas tool wiring (CanvasStage + overlays + drawer + playback):
  `tools/vscode/webview/atlas/App.tsx`
- Sidecar data types consumed by `AnimationDrawerHeader`:
  `tools/vscode/extension/tools/atlas/sidecar.ts`
