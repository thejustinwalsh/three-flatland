import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import {
  Badge,
  Collapsible,
  DevReloadToast,
  Divider,
  NumberField,
  Panel,
  Toolbar,
  ToolbarButton,
  useCssVar,
} from '@three-flatland/design-system'
import {
  AutoDetectOverlay,
  CanvasStage,
  GridSliceOverlay,
  HoverFrameChip,
  InfoPanel,
  RectOverlay,
  cellExtent,
  cellKey,
  connectedComponents,
  gridFromCellSize,
  gridFromRowCol,
  useImageData,
  useViewportController,
  type CCLOptions,
  type DetectedRect,
  type GridSpec,
  type Rect,
  type ViewportController,
} from '@three-flatland/preview'
import { AtlasMenu } from './AtlasMenu'
import { prefsStore, usePrefs } from './prefs'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z } from '@three-flatland/design-system/tokens/z.stylex'

type InitPayload = {
  imageUri: string
  fileName: string
  /** Rects seeded from an existing sidecar, if one was found and valid. */
  rects?: readonly Rect[]
  /** Populated when a sidecar existed but failed to parse/validate. */
  loadError?: string | null
}

declare global {
  interface Window {
    __FL_ATLAS__?: InitPayload
  }
}

type Tool = 'select' | 'rect' | 'move'
type RenameMode =
  | { kind: 'none' }
  | { kind: 'inline'; id: string }
  | { kind: 'prefix'; ids: string[] }

type SliceInputMode = 'pixels' | 'cells'

type SliceState = {
  inputMode: SliceInputMode
  cellW: number
  cellH: number
  cols: number
  rows: number
  offsetX: number
  offsetY: number
  gutterX: number
  gutterY: number
  /** Generated/edited grid; line drag updates this directly. */
  grid: GridSpec
  /** cellKey(row, col) values for cells the user wants to commit. */
  picked: Set<string>
  /** Name prefix for committed cells; auto-numbered in reading order. */
  prefix: string
}

type AutoDetectState = {
  /** Set when the user has run a detection pass; null until then. */
  detected: DetectedRect[]
  /** Indices into `detected` the user has picked to commit. */
  picked: Set<number>
  /** Name prefix for committed cells; auto-numbered in reading order. */
  prefix: string
  /** Detection options (alpha threshold, connectivity, min size). */
  options: Required<CCLOptions>
}

type EditorMode =
  | { kind: 'normal' }
  | { kind: 'slicing'; state: SliceState }
  | { kind: 'autodetect'; state: AutoDetectState }

function dumpThemeTokens() {
  const styles = getComputedStyle(document.body)
  const keys = [
    'foreground',
    'descriptionForeground',
    'editor-background',
    'focusBorder',
    'font-family',
    'font-size',
  ] as const
  const report: Record<string, string> = {}
  for (const k of keys) report[k] = styles.getPropertyValue(`--vscode-${k}`).trim()
  report['body.classList'] = document.body.className
  console.info('[FL Atlas] theme tokens', report)
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable
}

/**
 * Compute the alpha-trimmed bounding box of a single rect: the smallest
 * rect that fully contains every pixel inside `rect` whose alpha is > 0.
 * Returns null when the rect is fully transparent (caller falls back to
 * the raw rect for display purposes). O(rect.w * rect.h) — cheap enough
 * to compute live for every frame in the panel.
 */
function trimAlphaBbox(
  rect: { x: number; y: number; w: number; h: number },
  imageData: ImageData,
): { x: number; y: number; w: number; h: number } | null {
  const { data, width } = imageData
  let minX = rect.x + rect.w
  let minY = rect.y + rect.h
  let maxX = rect.x - 1
  let maxY = rect.y - 1
  for (let yy = rect.y; yy < rect.y + rect.h; yy++) {
    for (let xx = rect.x; xx < rect.x + rect.w; xx++) {
      const a = data[(yy * width + xx) * 4 + 3]!
      if (a === 0) continue
      if (xx < minX) minX = xx
      if (yy < minY) minY = yy
      if (xx > maxX) maxX = xx
      if (yy > maxY) maxY = yy
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * CSS background props for a sprite-sheet thumbnail. Renders the rect's
 * (or trimmed bbox's) pixels centered inside a `boxW × boxH` element via
 * `background-image` + `background-size` + `background-position`. The
 * source image loads once (browser caches the URL); each thumb just
 * scales/offsets the same image.
 */
function thumbStyle(
  imageUri: string,
  imageW: number,
  imageH: number,
  rect: { x: number; y: number; w: number; h: number },
  boxW: number,
  boxH: number,
): { bgImage: string; bgSize: string; bgPos: string } {
  const scale = Math.min(boxW / rect.w, boxH / rect.h)
  const displayW = imageW * scale
  const displayH = imageH * scale
  const offsetX = -rect.x * scale + (boxW - rect.w * scale) / 2
  const offsetY = -rect.y * scale + (boxH - rect.h * scale) / 2
  return {
    bgImage: `url("${imageUri}")`,
    bgSize: `${displayW}px ${displayH}px`,
    bgPos: `${offsetX}px ${offsetY}px`,
  }
}

/**
 * Returns the prefix portion of a `<prefix>_<index>` name. Rects without
 * the suffix (or no name at all) return null and end up in the "Unnamed"
 * group.
 */
function groupKey(name: string | undefined): string | null {
  if (!name) return null
  const m = /^(.+)_\d+$/.exec(name)
  return m ? m[1]! : null
}

/** Trailing numeric index from a `<prefix>_<index>` name, or 0 if absent. */
function indexFromName(name: string | undefined): number {
  if (!name) return 0
  const m = /_(\d+)$/.exec(name)
  return m ? Number(m[1]) : 0
}

type FrameGroup = { prefix: string; rects: Rect[] }

function groupRectsByPrefix(rects: readonly Rect[]): { named: FrameGroup[]; singles: Rect[] } {
  const namedMap = new Map<string, Rect[]>()
  const singles: Rect[] = []
  for (const r of rects) {
    const key = groupKey(r.name)
    if (key === null) {
      singles.push(r)
    } else {
      const arr = namedMap.get(key)
      if (arr) arr.push(r)
      else namedMap.set(key, [r])
    }
  }
  const named: FrameGroup[] = [...namedMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, rs]) => ({
      prefix,
      rects: rs.slice().sort((a, b) => indexFromName(a.name) - indexFromName(b.name)),
    }))
  return { named, singles }
}

/**
 * Sort rects into reading-order (top-to-bottom, left-to-right) with a
 * y-tolerance of ~half the median rect height so rects that are vertically
 * within the same row cluster together before being ordered by x.
 */
function readingOrder(rects: readonly Rect[]): Rect[] {
  if (rects.length === 0) return []
  const heights = rects.map((r) => r.h).sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)] ?? 1
  const tol = Math.max(1, Math.round(medianH / 2))
  return [...rects].sort((a, b) => {
    const dy = a.y - b.y
    if (Math.abs(dy) > tol) return dy
    return a.x - b.x
  })
}

const s = stylex.create({
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    outlineStyle: 'none',
    backgroundColor: vscode.bg,
    color: vscode.fg,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
  toolbarSpacer: { flex: 1 },
  workArea: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    // No column gap — the 4px splitter sits directly between the panels.
    // Outer padding keeps the work area off the toolbar / window edges.
    padding: space.lg,
  },
  // Atlas | splitter | Frames sidebar. Splitter is 4px; Frames width is
  // user-controlled with both columns clamped to a 200px min so the user
  // can't collapse either side away.
  workAreaCols: (framesPx: number) => ({
    gridTemplateColumns: `minmax(200px, 1fr) 4px ${framesPx}px`,
  }),
  previewWrap: { flex: 1, minHeight: 0 },
  emptyState: { color: vscode.descriptionFg },
  hintDim: { opacity: 0.6 },
  frameList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  frameItem: {
    paddingInline: space.md,
    paddingBlock: space.sm,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
  },
  frameItemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
    minWidth: 0,
    flex: 1,
  },
  thumb: {
    width: 28,
    height: 28,
    flex: '0 0 auto',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    backgroundRepeat: 'no-repeat',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    imageRendering: 'pixelated',
  },
  // VscodeBadge's counter variant has fixed 18px min-height / 11px
  // line-height inside its shadow DOM, taller than the collapsible's
  // header text. Visually shrink it via transform-scale (transform
  // doesn't affect layout box, so the header row height stays unchanged).
  collapsibleBadge: {
    marginInlineStart: space.md,
    transform: 'scale(0.85)',
    transformOrigin: 'center right',
  },
  thumbBg: (
    bgImage: string,
    bgSize: string,
    bgPos: string,
  ) => ({
    backgroundImage: bgImage,
    backgroundSize: bgSize,
    backgroundPosition: bgPos,
  }),
  frameItemSelected: {
    backgroundColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
  },
  frameItemEditing: { cursor: 'text' },
  frameName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    // Match the inline rename input's box (padding + 1px transparent
    // border) so swapping span → input doesn't shift the row content.
    paddingInline: space.sm,
    paddingBlock: space.xs,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
  frameCoords: { opacity: 0.7, flex: '0 0 auto' },
  inlineRenameInput: {
    flex: 1,
    minWidth: 0,
    paddingInline: space.sm,
    paddingBlock: space.xs,
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    outlineStyle: 'none',
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  saveStatusBase: {
    position: 'fixed',
    left: space.xxl,
    bottom: space.xxl,
    zIndex: z.overlay,
    paddingInline: space.xl,
    paddingBlock: space.md,
    borderRadius: radius.md,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
    maxWidth: '60%',
  },
  saveStatusInfo: {
    backgroundColor: vscode.panelBg,
    color: vscode.fg,
  },
  saveStatusError: {
    backgroundColor: vscode.errorBg,
    color: vscode.errorFg,
    borderColor: vscode.errorBorder,
  },
  prefixBar: {
    display: 'flex',
    gap: space.md,
    alignItems: 'center',
    paddingInline: space.sm,
    paddingBlock: space.md,
    marginBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
  },
  prefixLabel: {
    color: vscode.descriptionFg,
    whiteSpace: 'nowrap',
  },
  prefixSuffix: {
    opacity: 0.65,
    whiteSpace: 'nowrap',
  },
  // Slice mode — config panel inside the Frames sidebar
  slicePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  sliceModeRow: {
    display: 'flex',
    gap: space.sm,
  },
  sliceModeBtn: {
    flex: 1,
    paddingInline: space.md,
    paddingBlock: space.sm,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    textAlign: 'center',
  },
  sliceModeBtnActive: {
    backgroundColor: vscode.btnBg,
    color: vscode.btnFg,
    borderColor: vscode.focusRing,
  },
  // Two-pair input grid: [label][input] [label][input] across 4 columns.
  // The two `auto` columns each size to the WIDEST label in that column,
  // so all left labels (Cell W, Offset X, Gutter X) align with each
  // other and all right labels (Cell H, Offset Y, Gutter Y) align too.
  sliceGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto 1fr',
    rowGap: space.sm,
    columnGap: space.lg,
    alignItems: 'center',
  },
  // Single-pair row with one input that spans the remaining 3 columns
  // of the parent grid (label in col 1, input from col 2 to col -1).
  sliceFieldFull: {
    gridColumn: '2 / -1',
  },
  sliceLabel: {
    color: vscode.descriptionFg,
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  sliceNumInput: {
    width: '100%',
    minWidth: 0,
    paddingInline: space.sm,
    paddingBlock: space.xs,
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    outlineStyle: 'none',
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  sliceDivider: {
    height: 1,
    backgroundColor: vscode.panelBorder,
    marginBlock: space.sm,
  },
  sliceCount: {
    color: vscode.descriptionFg,
    fontSize: '11px',
  },
  sliceActions: {
    display: 'flex',
    gap: space.md,
    marginTop: space.md,
  },
  sliceBtn: {
    flex: 1,
    paddingInline: space.md,
    paddingBlock: space.md,
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    backgroundColor: vscode.btnBg,
    color: vscode.btnFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.btnBorder,
    borderRadius: radius.sm,
    fontFamily: vscode.fontFamily,
    fontSize: '12px',
    opacity: { default: 1, ':disabled': 0.45 },
  },
  sliceBtnGhost: {
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderColor: vscode.panelBorder,
  },
  // Right-side panel column — holds Frames + active tool panel(s).
  sidebarStack: {
    display: 'grid',
    minHeight: 0,
    height: '100%',
  },
  sidebarRows: (rows: string) => ({ gridTemplateRows: rows }),
  splitter: {
    height: 4,
    cursor: 'row-resize',
    backgroundColor: {
      default: 'transparent',
      ':hover': vscode.focusRing,
    },
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
  splitterV: {
    width: 4,
    cursor: 'col-resize',
    backgroundColor: {
      default: 'transparent',
      ':hover': vscode.focusRing,
    },
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
})

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)
  const [rects, setRects] = useState<Rect[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<Tool>('rect')
  const [renameMode, setRenameMode] = useState<RenameMode>({ kind: 'none' })
  const [prefixDraft, setPrefixDraft] = useState('')
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [mode, setMode] = useState<EditorMode>({ kind: 'normal' })
  // Fraction of the right sidebar height taken by the Frames panel when a
  // tool panel is active below it. Persisted in component state only; resets
  // to default on remount.
  const [framesFrac, setFramesFrac] = useState(0.5)
  const sidebarRef = useRef<HTMLDivElement>(null)
  // User-resizable width of the Frames sidebar. Clamped to 200px min on
  // both columns; default 280px matches the prior fixed value.
  const [framesPx, setFramesPx] = useState(280)
  const workAreaRef = useRef<HTMLDivElement>(null)
  // Viewport controller is owned by CanvasStage and exposed via context;
  // a tiny <ViewportControllerSink> child captures it into this ref so the
  // toolbar (rendered outside CanvasStage) can call zoom/fit methods.
  const viewportControllerRef = useRef<ViewportController | null>(null)
  // Decoded ImageData lives in CanvasStage's state; an <ImageDataSink>
  // child surfaces it here so panels rendered in the sidebar (outside
  // CanvasStage's provider tree) can read it.
  const [imageData, setImageData] = useState<ImageData | null>(null)
  // Hovered rect (drives the bottom-left HoverFrameChip).
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null)
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number; path: string; count: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  const bridgeRef = useRef<ReturnType<typeof createClientBridge> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')
  // Persistent display preferences (background style, dim, color/coord
  // formats, overlay visibility). Edited via the AtlasMenu hamburger in
  // the Atlas Panel header.
  const prefs = usePrefs()

  // VSCode webviews only dispatch modifier-key keydowns (Cmd+A, Cmd+S, …)
  // to the DOM when something inside the webview has focus. Give the root
  // div a tabindex, focus it on mount, and refocus on any pointerdown
  // that isn't already inside an input/button so keyboard shortcuts keep
  // working after toolbar clicks / selection updates.
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const handleRootPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isEditableTarget(e.target)) return
    if (!(e.target instanceof Element)) return
    // Let toolbar buttons / custom elements keep their own focus semantics.
    if (e.target.closest('vscode-toolbar-button, button, a, [tabindex]:not([tabindex="-1"])')) return
    rootRef.current?.focus()
  }, [])

  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    rects.forEach((r, i) => m.set(r.id, i))
    return m
  }, [rects])

  useEffect(() => {
    dumpThemeTokens()
    const bridge = createClientBridge()
    bridgeRef.current = bridge
    const off = bridge.on<InitPayload>('atlas/init', (p) => {
      setPayload(p)
      if (p.rects && p.rects.length > 0) {
        // Seed from the sidecar. Clone so later setRects mutations don't
        // share the array reference with the init payload.
        setRects([...p.rects])
      }
      if (p.loadError) {
        setSaveStatus({
          kind: 'error',
          message: `Sidecar exists but failed to load — ${p.loadError}`,
        })
      }
    })
    void bridge.request('atlas/ready')
    return off
  }, [])

  const handleSave = useCallback(async () => {
    const bridge = bridgeRef.current
    if (!bridge) return
    if (!imageSize) {
      setSaveStatus({ kind: 'error', message: 'Image not loaded yet' })
      return
    }
    if (rects.length === 0) {
      setSaveStatus({ kind: 'error', message: 'No rects to save' })
      return
    }
    setSaveStatus({ kind: 'saving' })
    try {
      const res = await bridge.request<{
        ok: true
        sidecarUri: string
        frameCount: number
      }>('atlas/save', {
        rects: rects.map(({ id, x, y, w, h, name }) => ({ id, x, y, w, h, name })),
        image: { width: imageSize.w, height: imageSize.h },
      })
      setSaveStatus({
        kind: 'saved',
        at: Date.now(),
        path: res.sidecarUri,
        count: res.frameCount,
      })
    } catch (err) {
      setSaveStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [rects, imageSize])

  const handleRectCreate = useCallback((r: Rect) => {
    setRects((prev) => [...prev, r])
    setSelectedIds(new Set([r.id]))
  }, [])

  const handleRectChange = useCallback(
    (id: string, next: { x: number; y: number; w: number; h: number }) => {
      setRects((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)))
    },
    [],
  )

  // Space-hold temporarily switches to Move (pan-only) mode. Original
  // tool is restored on release. The toolbar Move button reflects 'move'
  // for the duration so the user has consistent feedback.
  const toolBeforeSpaceRef = useRef<Tool | null>(null)
  const handleSpaceHold = useCallback((down: boolean) => {
    if (down) {
      if (toolBeforeSpaceRef.current !== null) return // already held
      toolBeforeSpaceRef.current = tool
      setTool('move')
    } else {
      const prev = toolBeforeSpaceRef.current
      if (prev !== null) {
        setTool(prev)
        toolBeforeSpaceRef.current = null
      }
    }
  }, [tool])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    setRects((prev) => prev.filter((r) => !selectedIds.has(r.id)))
    setSelectedIds(new Set())
  }, [selectedIds])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(rects.map((r) => r.id)))
  }, [rects])

  const renameRect = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    setRects((prev) =>
      prev.map((r) => (r.id === id ? { ...r, name: trimmed === '' ? undefined : trimmed } : r))
    )
  }, [])

  const applyPrefixToSelection = useCallback(
    (prefix: string) => {
      const p = prefix.trim()
      if (p === '') return
      const ids = new Set(selectedIds)
      const selectedRects = rects.filter((r) => ids.has(r.id))
      const ordered = readingOrder(selectedRects)
      const nameById = new Map<string, string>()
      ordered.forEach((r, i) => {
        nameById.set(r.id, `${p}_${i}`)
      })
      setRects((prev) =>
        prev.map((r) => (nameById.has(r.id) ? { ...r, name: nameById.get(r.id) } : r))
      )
    },
    [rects, selectedIds]
  )

  const startRename = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (ids.length === 1) {
      setRenameMode({ kind: 'inline', id: ids[0]! })
    } else {
      setPrefixDraft('frame')
      setRenameMode({ kind: 'prefix', ids })
    }
  }, [selectedIds])

  // Build a fresh GridSpec from the current slice input params + image size.
  // Topology-changing edits (cellW/H, cols/rows, offsets, gutters) clear picks
  // because (row, col) keys would no longer line up with previous extents.
  // Drag edits go straight to slice.grid and preserve picks naturally.
  const regenerateGrid = useCallback(
    (next: SliceState): SliceState => {
      const w = imageSize?.w ?? 0
      const h = imageSize?.h ?? 0
      if (w <= 0 || h <= 0) return next
      const grid =
        next.inputMode === 'pixels'
          ? gridFromCellSize(w, h, next.cellW, next.cellH, next.offsetX, next.offsetY, next.gutterX, next.gutterY)
          : gridFromRowCol(w, h, next.cols, next.rows, next.offsetX, next.offsetY, next.gutterX, next.gutterY)
      return { ...next, grid, picked: new Set() }
    },
    [imageSize],
  )

  const enterSlice = useCallback(() => {
    if (!imageSize) return
    const initial: SliceState = regenerateGrid({
      inputMode: 'pixels',
      cellW: 16,
      cellH: 16,
      cols: 0,
      rows: 0,
      offsetX: 0,
      offsetY: 0,
      gutterX: 0,
      gutterY: 0,
      grid: { colEdges: [], rowEdges: [] },
      picked: new Set(),
      prefix: 'frame',
    })
    setMode({ kind: 'slicing', state: initial })
    setSelectedIds(new Set())
    setRenameMode({ kind: 'none' })
  }, [imageSize, regenerateGrid])

  const exitSlice = useCallback(() => {
    setMode({ kind: 'normal' })
  }, [])

  const updateSlice = useCallback((updater: (prev: SliceState) => SliceState) => {
    setMode((m) => (m.kind === 'slicing' ? { kind: 'slicing', state: updater(m.state) } : m))
  }, [])

  const updateSliceParams = useCallback(
    (patch: Partial<SliceState>) => {
      updateSlice((prev) => {
        const merged = { ...prev, ...patch }
        // When toggling between input modes, derive the OTHER mode's
        // values from the current state so both stay in sync. Without
        // this, the freshly-shown fields (cols/rows or cellW/H) would
        // display whatever stale value was last set in that mode.
        if (patch.inputMode && patch.inputMode !== prev.inputMode && imageSize) {
          const w = imageSize.w
          const h = imageSize.h
          if (patch.inputMode === 'cells') {
            merged.cols = Math.max(
              1,
              Math.floor((w - merged.offsetX + merged.gutterX) / (merged.cellW + merged.gutterX)),
            )
            merged.rows = Math.max(
              1,
              Math.floor((h - merged.offsetY + merged.gutterY) / (merged.cellH + merged.gutterY)),
            )
          } else {
            merged.cellW = Math.max(
              1,
              Math.floor((w - merged.offsetX - (merged.cols - 1) * merged.gutterX) / merged.cols),
            )
            merged.cellH = Math.max(
              1,
              Math.floor((h - merged.offsetY - (merged.rows - 1) * merged.gutterY) / merged.rows),
            )
          }
        }
        return regenerateGrid(merged)
      })
    },
    [updateSlice, regenerateGrid, imageSize],
  )

  const setCellPicked = useCallback(
    (row: number, col: number, picked: boolean) => {
      // Starting a new pick session after a commit (picks empty, selection
      // still showing the just-committed rects) → clear that selection so
      // the user has a clean canvas to mark up.
      if (mode.kind === 'slicing' && mode.state.picked.size === 0 && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
      updateSlice((prev) => {
        const key = cellKey(row, col)
        const has = prev.picked.has(key)
        if (picked === has) return prev
        const next = new Set(prev.picked)
        if (picked) next.add(key)
        else next.delete(key)
        return { ...prev, picked: next }
      })
    },
    [updateSlice, mode, selectedIds],
  )

  const setSliceGrid = useCallback(
    (next: GridSpec) => {
      updateSlice((prev) => ({ ...prev, grid: next }))
    },
    [updateSlice],
  )

  // Commit picked cells as named rects but STAY in slice mode so the user
  // can mark out additional ranges without re-entering the tool. Picks
  // clear after commit; the grid + prefix persist so subsequent commits
  // pick up where the last one left off.
  //
  // Frame order = user's pick order. Set iteration is insertion-order,
  // so we just iterate state.picked directly — no row-major sort. If the
  // user wanted the cells reordered they'd pick them in a different
  // order; we don't impose a reading-order convention.
  const commitSlice = useCallback(() => {
    if (mode.kind !== 'slicing') return
    const { state } = mode
    const prefix = state.prefix.trim()
    if (prefix === '' || state.picked.size === 0) return
    const newRects: Rect[] = [...state.picked].map((k, i) => {
      const [r, c] = k.split(',').map(Number) as [number, number]
      const ext = cellExtent(state.grid, r, c)
      return { id: crypto.randomUUID(), x: ext.x, y: ext.y, w: ext.w, h: ext.h, name: `${prefix}_${i}` }
    })
    setRects((prev) => [...prev, ...newRects])
    setSelectedIds(new Set(newRects.map((r) => r.id)))
    updateSlice((prev) => ({ ...prev, picked: new Set() }))
  }, [mode, updateSlice])

  const slicing = mode.kind === 'slicing'
  const sliceCanCommit =
    mode.kind === 'slicing' &&
    mode.state.picked.size > 0 &&
    mode.state.prefix.trim() !== ''

  // ─── Autodetect (CCL) ──────────────────────────────────────────────────────

  const autodetect = mode.kind === 'autodetect'

  const updateAutoDetect = useCallback(
    (updater: (prev: AutoDetectState) => AutoDetectState) => {
      setMode((m) => (m.kind === 'autodetect' ? { kind: 'autodetect', state: updater(m.state) } : m))
    },
    [],
  )

  const enterAutoDetect = useCallback(() => {
    if (!imageSize) return
    setMode({
      kind: 'autodetect',
      state: {
        detected: [],
        picked: new Set(),
        prefix: 'sprite',
        options: { alphaThreshold: 1, minPixels: 4, minSize: 2, connectivity: 4 },
      },
    })
    setSelectedIds(new Set())
    setRenameMode({ kind: 'none' })
  }, [imageSize])

  const exitAutoDetect = useCallback(() => {
    setMode({ kind: 'normal' })
  }, [])

  const setAutoDetectOption = useCallback(
    <K extends keyof Required<CCLOptions>>(key: K, value: Required<CCLOptions>[K]) => {
      updateAutoDetect((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }))
    },
    [updateAutoDetect],
  )

  const setAutoDetectPrefix = useCallback(
    (prefix: string) => updateAutoDetect((prev) => ({ ...prev, prefix })),
    [updateAutoDetect],
  )

  const toggleAutoDetectPick = useCallback(
    (i: number, additive: boolean) => {
      updateAutoDetect((prev) => {
        const next = new Set(prev.picked)
        if (next.has(i)) next.delete(i)
        else if (!additive) {
          // non-additive single-toggle: still just toggles (consistent with slice)
          next.add(i)
        } else {
          next.add(i)
        }
        return { ...prev, picked: next }
      })
    },
    [updateAutoDetect],
  )

  const setAutoDetectPicked = useCallback(
    (picked: Set<number>) => updateAutoDetect((prev) => ({ ...prev, picked })),
    [updateAutoDetect],
  )

  const commitAutoDetect = useCallback(() => {
    if (mode.kind !== 'autodetect') return
    const { state } = mode
    const prefix = state.prefix.trim()
    if (prefix === '' || state.picked.size === 0) return
    // Frame order = user's pick order (Set iteration is insertion-order),
    // not the algorithm's reading-order sort. Lets the user override the
    // CCL ordering by picking blobs in their own sequence.
    const newRects: Rect[] = [...state.picked].map((i, idx) => {
      const d = state.detected[i]!
      return { id: crypto.randomUUID(), x: d.x, y: d.y, w: d.w, h: d.h, name: `${prefix}_${idx}` }
    })
    setRects((prev) => [...prev, ...newRects])
    setSelectedIds(new Set(newRects.map((r) => r.id)))
    updateAutoDetect((prev) => ({ ...prev, picked: new Set() }))
  }, [mode, updateAutoDetect])

  const autoDetectCanCommit =
    mode.kind === 'autodetect' &&
    mode.state.picked.size > 0 &&
    mode.state.prefix.trim() !== ''

  const inTool = slicing || autodetect

  // Keyboard — only consumes keys we handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (mode.kind === 'slicing') {
          exitSlice()
          e.preventDefault()
          return
        }
        if (mode.kind === 'autodetect') {
          exitAutoDetect()
          e.preventDefault()
          return
        }
        if (renameMode.kind !== 'none') {
          setRenameMode({ kind: 'none' })
          e.preventDefault()
          return
        }
        if (selectedIds.size === 0) return
        clearSelection()
        e.preventDefault()
        return
      }
      if (e.key === 'Enter' && mode.kind === 'slicing') {
        if (sliceCanCommit) {
          commitSlice()
          e.preventDefault()
        }
        return
      }
      if (e.key === 'Enter' && mode.kind === 'autodetect') {
        if (autoDetectCanCommit) {
          commitAutoDetect()
          e.preventDefault()
        }
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size === 0) return
        deleteSelected()
        e.preventDefault()
        return
      }
      if (mod && (e.key === 'a' || e.key === 'A')) {
        // Always intercept — we never want the browser's 'select all text'
        // default in this webview, even when there are no rects yet.
        e.preventDefault()
        if (rects.length > 0) selectAll()
        return
      }
      // Cmd/Ctrl+S — Save. preventDefault first so the browser never sees
      // it (VSCode would otherwise offer its own Save dialog for the panel).
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void handleSave()
        return
      }

      if (mod || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'r') setTool('rect')
      else if (k === 's') setTool('select')
      else if (k === 'm') setTool('move')
      else if (k === 'n') {
        if (selectedIds.size > 0) {
          startRename()
          e.preventDefault()
        }
      }
    }
    // Use capture phase so we preventDefault on Cmd+A / Cmd+S before any
    // bubble-phase handler (including the browser's implicit default) can
    // fire. Without capture, some hosts still process the default action.
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [
    selectedIds,
    rects,
    renameMode,
    clearSelection,
    deleteSelected,
    selectAll,
    startRename,
    handleSave,
    mode,
    sliceCanCommit,
    commitSlice,
    exitSlice,
    autoDetectCanCommit,
    commitAutoDetect,
    exitAutoDetect,
  ])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onPointerDown={handleRootPointerDown}
      {...stylex.props(s.root)}
    >
      <Toolbar>
        <ToolbarButton
          icon="symbol-ruler"
          title="Grid Slice"
          toggleable
          checked={slicing}
          disabled={autodetect}
          onClick={() => (slicing ? exitSlice() : enterSlice())}
        />
        <ToolbarButton
          icon="wand"
          title="Auto Detect Sprites"
          toggleable
          checked={autodetect}
          disabled={slicing}
          onClick={() => (autodetect ? exitAutoDetect() : enterAutoDetect())}
        />
        <Divider />
        <ToolbarButton
          icon="add"
          title="Draw Rect  (R)"
          toggleable
          checked={tool === 'rect' && !inTool}
          disabled={inTool}
          onClick={() => setTool('rect')}
        />
        <ToolbarButton
          icon="selection"
          title="Select  (S)"
          toggleable
          checked={tool === 'select' && !inTool}
          disabled={inTool}
          onClick={() => setTool('select')}
        />
        <ToolbarButton
          icon="move"
          title="Move  (M)"
          toggleable
          checked={tool === 'move' && !inTool}
          disabled={inTool}
          onClick={() => setTool('move')}
        />
        <Divider />
        <ToolbarButton
          icon="symbol-string"
          title="Rename / Auto-name  (N)"
          disabled={inTool}
          onClick={startRename}
        />
        <ToolbarButton icon="run-all" title="Animations" disabled={inTool} />
        <div {...stylex.props(s.toolbarSpacer)} />
        <ToolbarButton
          icon="zoom-in"
          title="Zoom In"
          onClick={() => viewportControllerRef.current?.zoomIn()}
        />
        <ToolbarButton
          icon="zoom-out"
          title="Zoom Out"
          onClick={() => viewportControllerRef.current?.zoomOut()}
        />
        <ToolbarButton
          icon="screen-full"
          title="Fit"
          onClick={() => viewportControllerRef.current?.fitToView()}
        />
        <Divider />
        <ToolbarButton
          icon="trash"
          title="Delete Selected  (Del)"
          disabled={inTool}
          onClick={deleteSelected}
        />
        <ToolbarButton
          icon="clear-all"
          title="Clear All Rects"
          disabled={inTool}
          onClick={() => {
            setRects([])
            setSelectedIds(new Set())
          }}
        />
        <ToolbarButton
          icon={saveStatus.kind === 'saving' ? 'loading' : 'save'}
          title="Save Atlas  (⌘S)"
          disabled={inTool}
          onClick={() => void handleSave()}
        />
      </Toolbar>

      <div
        ref={workAreaRef}
        {...stylex.props(s.workArea, s.workAreaCols(framesPx))}
      >
        <Panel title="Atlas" headerActions={<AtlasMenu prefs={prefs} />}>
          <div {...stylex.props(s.previewWrap)}>
            <CanvasStage
              imageUri={payload?.imageUri ?? null}
              background={editorBg}
              backgroundStyle={prefs.background === 'checker' ? 'checker' : 'solid'}
              dimOutOfBounds={prefs.dimOutOfBounds}
              onImageReady={setImageSize}
              panMode={tool === 'move' && !inTool}
              onSpaceHold={handleSpaceHold}
            >
              <RectOverlay
                rects={rects}
                drawEnabled={tool === 'rect' && !inTool}
                interactive={!inTool}
                onRectCreate={handleRectCreate}
                onRectChange={inTool ? undefined : handleRectChange}
                selectedIds={selectedIds}
                onSelectionChange={inTool ? undefined : setSelectedIds}
                onHoverChange={setHoveredRect}
                showLabels={prefs.showFrameNumbers}
              />
              {mode.kind === 'slicing' ? (
                <GridSliceOverlay
                  grid={mode.state.grid}
                  picked={mode.state.picked}
                  onGridChange={setSliceGrid}
                  onCellSet={setCellPicked}
                  frameOffset={rects.length}
                />
              ) : null}
              {mode.kind === 'autodetect' ? (
                <AutoDetectOverlay
                  detected={mode.state.detected}
                  picked={mode.state.picked}
                  onToggle={toggleAutoDetectPick}
                  onSetPicked={setAutoDetectPicked}
                />
              ) : null}
              <ViewportControllerSink controllerRef={viewportControllerRef} />
              <ImageDataSink onChange={setImageData} />
              {prefs.showHoverChip ? (
                <HoverFrameChip
                  rect={hoveredRect}
                  index={hoveredRect ? rects.indexOf(hoveredRect) : null}
                />
              ) : null}
              {prefs.showInfoPanel ? (
                <InfoPanel
                  colorMode={prefs.colorMode}
                  onColorModeChange={(v) => prefsStore.set({ colorMode: v })}
                  coordMode={prefs.coordMode}
                  onCoordModeChange={(v) => prefsStore.set({ coordMode: v })}
                />
              ) : null}
            </CanvasStage>
          </div>
        </Panel>

        <Splitter
          axis="vertical"
          onDrag={(clientX) => {
            const el = workAreaRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            // Frames width = the distance from the cursor to the right
            // edge of the work area. Clamped so neither column drops
            // below 200px (the splitter itself is 4px + 2× space.lg
            // padding ≈ 20px, so we leave a small margin).
            const next = rect.right - clientX
            const min = 200
            // Splitter (4px) is the only inter-column gap now — leave just
            // a tiny margin so the user can't overlap the columns.
            const max = Math.max(min, rect.width - 200 - 4)
            setFramesPx(Math.max(min, Math.min(max, next)))
          }}
        />

        <div
          ref={sidebarRef}
          {...stylex.props(
            s.sidebarStack,
            s.sidebarRows(inTool ? 'minmax(0, 1fr) max-content' : '1fr'),
          )}
        >
        <Panel
          title={`Frames (${rects.length}${selectedIds.size > 0 ? ` · ${selectedIds.size} sel` : ''})`}
        >
          {renameMode.kind === 'prefix' ? (
            <PrefixRenameBar
              initial={prefixDraft}
              count={renameMode.ids.length}
              onCommit={(prefix) => {
                applyPrefixToSelection(prefix)
                setRenameMode({ kind: 'none' })
              }}
              onCancel={() => setRenameMode({ kind: 'none' })}
            />
          ) : null}

          {rects.length === 0 ? (
            <div {...stylex.props(s.emptyState)}>
              {inTool
                ? 'No frames yet. Pick cells in the active tool panel and Commit to add them.'
                : (
                  <>
                    Draw rects with the <i className="codicon codicon-add" /> tool{' '}
                    <span {...stylex.props(s.hintDim)}>(R)</span>.
                  </>
                )}
            </div>
          ) : (
            <FramesView
              rects={rects}
              imageUri={payload?.imageUri ?? null}
              imageData={imageData}
              imageSize={imageSize}
              selectedIds={selectedIds}
              renameMode={renameMode}
              onSelectRect={(id, additive) => {
                const next = new Set(selectedIds)
                if (additive) {
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                } else {
                  next.clear()
                  next.add(id)
                }
                setSelectedIds(next)
              }}
              onSelectGroup={(ids, additive) => {
                const next = additive ? new Set(selectedIds) : new Set<string>()
                for (const id of ids) next.add(id)
                setSelectedIds(next)
              }}
              onStartInlineRename={(id) => {
                setSelectedIds(new Set([id]))
                setRenameMode({ kind: 'inline', id })
              }}
              onCommitInlineRename={(id, name) => {
                renameRect(id, name)
                setRenameMode({ kind: 'none' })
              }}
              onCancelInlineRename={() => setRenameMode({ kind: 'none' })}
            />
          )}
        </Panel>

        {inTool ? (
          <>
            {mode.kind === 'slicing' ? (
              <Panel title={`Slice (${mode.state.picked.size} picked)`}>
                <SliceConfigPanel
                  state={mode.state}
                  onParamsChange={updateSliceParams}
                  onPrefixChange={(prefix) => updateSlice((p) => ({ ...p, prefix }))}
                  canCommit={sliceCanCommit}
                  onCommit={commitSlice}
                  onCancel={exitSlice}
                />
              </Panel>
            ) : null}
            {mode.kind === 'autodetect' ? (
              <Panel title={`Auto Detect (${mode.state.picked.size}/${mode.state.detected.length} picked)`}>
                <AutoDetectConfigPanel
                  state={mode.state}
                  imageData={imageData}
                  onOptionChange={setAutoDetectOption}
                  onPrefixChange={setAutoDetectPrefix}
                  onDetect={(detected) =>
                    updateAutoDetect((prev) => ({
                      ...prev,
                      detected,
                      picked: new Set(detected.map((_, i) => i)),
                    }))
                  }
                  canCommit={autoDetectCanCommit}
                  onCommit={commitAutoDetect}
                  onCancel={exitAutoDetect}
                />
              </Panel>
            ) : null}
          </>
        ) : null}
        </div>
      </div>
      <SaveStatusLine status={saveStatus} />
      <DevReloadToast />
    </div>
  )

  // Minor: keep indexById live even if it's not displayed directly —
  // suppresses 'unused' lint and future frame-index helpers reuse it.
  void indexById
}

function InlineRenameInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string
  placeholder: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const handleKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onCommit(value)
      e.preventDefault()
    } else if (e.key === 'Escape') {
      onCancel()
      e.preventDefault()
    }
  }

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={handleKey}
      {...stylex.props(s.inlineRenameInput)}
    />
  )
}

function SaveStatusLine({
  status,
}: {
  status:
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number; path: string; count: number }
    | { kind: 'error'; message: string }
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (status.kind === 'saved') {
      setVisible(true)
      const t = setTimeout(() => setVisible(false), 2500)
      return () => clearTimeout(t)
    }
    if (status.kind === 'error') {
      setVisible(true)
      return
    }
    setVisible(status.kind === 'saving')
  }, [status])

  if (!visible || status.kind === 'idle') return null

  if (status.kind === 'saving') {
    return (
      <div {...stylex.props(s.saveStatusBase, s.saveStatusInfo)}>
        <i className="codicon codicon-loading codicon-modifier-spin" /> &nbsp;Saving atlas…
      </div>
    )
  }

  if (status.kind === 'error') {
    return (
      <div {...stylex.props(s.saveStatusBase, s.saveStatusError)}>
        <i className="codicon codicon-error" /> &nbsp;Save failed: {status.message}
      </div>
    )
  }

  // saved
  const fileName = status.path.split('/').pop() ?? status.path
  return (
    <div {...stylex.props(s.saveStatusBase, s.saveStatusInfo)}>
      <i className="codicon codicon-check" /> &nbsp;Saved {status.count} frame
      {status.count === 1 ? '' : 's'} → <strong>{fileName}</strong>
    </div>
  )
}

function PrefixRenameBar({
  initial,
  count,
  onCommit,
  onCancel,
}: {
  initial: string
  count: number
  onCommit: (prefix: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <div {...stylex.props(s.prefixBar)}>
      <span {...stylex.props(s.prefixLabel)}>
        Name {count} as:
      </span>
      <input
        ref={ref}
        value={value}
        placeholder="prefix"
        spellCheck={false}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
        onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            onCommit(value)
            e.preventDefault()
          } else if (e.key === 'Escape') {
            onCancel()
            e.preventDefault()
          }
        }}
        {...stylex.props(s.inlineRenameInput)}
      />
      <span {...stylex.props(s.prefixSuffix)}>{value || 'name'}_0 …</span>
    </div>
  )
}

type FrameRowHandlers = {
  onSelectRect: (id: string, additive: boolean) => void
  onStartInlineRename: (id: string) => void
  onCommitInlineRename: (id: string, name: string) => void
  onCancelInlineRename: () => void
}

function FrameRow({
  rect,
  globalIndex,
  selected,
  editing,
  handlers,
  thumbBg,
}: {
  rect: Rect
  globalIndex: number
  selected: boolean
  editing: boolean
  handlers: FrameRowHandlers
  /** Pre-computed thumb background props, or null while no source image. */
  thumbBg: { bgImage: string; bgSize: string; bgPos: string } | null
}) {
  const displayName = rect.name ?? `#${globalIndex}`
  return (
    <li
      onClick={(e) => {
        if (editing) return
        handlers.onSelectRect(rect.id, e.shiftKey)
      }}
      onDoubleClick={() => handlers.onStartInlineRename(rect.id)}
      {...stylex.props(s.frameItem, selected && s.frameItemSelected, editing && s.frameItemEditing)}
    >
      <span {...stylex.props(s.frameItemLeft)}>
        {thumbBg ? (
          <span
            aria-hidden="true"
            {...stylex.props(s.thumb, s.thumbBg(thumbBg.bgImage, thumbBg.bgSize, thumbBg.bgPos))}
          />
        ) : (
          <span aria-hidden="true" {...stylex.props(s.thumb)} />
        )}
        {editing ? (
          <InlineRenameInput
            initial={rect.name ?? ''}
            placeholder={`#${globalIndex}`}
            onCommit={(name) => handlers.onCommitInlineRename(rect.id, name)}
            onCancel={handlers.onCancelInlineRename}
          />
        ) : (
          <span {...stylex.props(s.frameName)}>{displayName}</span>
        )}
      </span>
      <span {...stylex.props(s.frameCoords)}>
        {rect.x},{rect.y} · {rect.w}×{rect.h}
      </span>
    </li>
  )
}

const THUMB_PX = 28

function FramesView({
  rects,
  imageUri,
  imageData,
  imageSize,
  selectedIds,
  renameMode,
  onSelectRect,
  onSelectGroup,
  onStartInlineRename,
  onCommitInlineRename,
  onCancelInlineRename,
}: {
  rects: Rect[]
  imageUri: string | null
  imageData: ImageData | null
  imageSize: { w: number; h: number } | null
  selectedIds: ReadonlySet<string>
  renameMode: RenameMode
  onSelectRect: (id: string, additive: boolean) => void
  onSelectGroup: (ids: string[], additive: boolean) => void
  onStartInlineRename: (id: string) => void
  onCommitInlineRename: (id: string, name: string) => void
  onCancelInlineRename: () => void
}) {
  const handlers: FrameRowHandlers = {
    onSelectRect,
    onStartInlineRename,
    onCommitInlineRename,
    onCancelInlineRename,
  }
  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    rects.forEach((r, i) => m.set(r.id, i))
    return m
  }, [rects])
  const groups = useMemo(() => groupRectsByPrefix(rects), [rects])

  // Pre-compute trimmed bboxes (when imageData is available) and the CSS
  // background props for each rect's thumbnail. Trim falls back to the
  // raw rect when the rect is fully transparent or imageData isn't ready.
  const thumbsById = useMemo(() => {
    const m = new Map<string, { bgImage: string; bgSize: string; bgPos: string }>()
    if (!imageUri || !imageSize) return m
    for (const r of rects) {
      const bbox = imageData ? (trimAlphaBbox(r, imageData) ?? r) : r
      m.set(r.id, thumbStyle(imageUri, imageSize.w, imageSize.h, bbox, THUMB_PX, THUMB_PX))
    }
    return m
  }, [rects, imageUri, imageData, imageSize])

  const renderList = (list: Rect[]) => (
    <ul {...stylex.props(s.frameList)}>
      {list.map((r) => {
        const sel = selectedIds.has(r.id)
        const editing = renameMode.kind === 'inline' && renameMode.id === r.id
        return (
          <FrameRow
            key={r.id}
            rect={r}
            globalIndex={indexById.get(r.id) ?? 0}
            selected={sel}
            editing={editing}
            handlers={handlers}
            thumbBg={thumbsById.get(r.id) ?? null}
          />
        )
      })}
    </ul>
  )
  return (
    <>
      {groups.named.map((g) => {
        const groupIds = g.rects.map((r) => r.id)
        return (
          <Collapsible
            key={g.prefix}
            heading={g.prefix}
            open
            onClick={(e: React.MouseEvent) => {
              // Shift-click on the header selects the whole group without
              // toggling collapsed state. The Lit collapsible's own
              // toggle still fires on plain clicks.
              if (!e.shiftKey) return
              e.preventDefault()
              e.stopPropagation()
              onSelectGroup(groupIds, false)
            }}
          >
            <Badge slot="decorations" variant="counter" {...stylex.props(s.collapsibleBadge)}>
              {g.rects.length}
            </Badge>
            {renderList(g.rects)}
          </Collapsible>
        )
      })}
      {groups.singles.length > 0 ? (
        groups.named.length === 0 ? (
          renderList(groups.singles)
        ) : (
          <Collapsible heading="Unnamed" open>
            <Badge slot="decorations" variant="counter" {...stylex.props(s.collapsibleBadge)}>
              {groups.singles.length}
            </Badge>
            {renderList(groups.singles)}
          </Collapsible>
        )
      ) : null}
    </>
  )
}

/**
 * Captures the CanvasStage's ViewportController into an external ref so the
 * Toolbar (rendered outside CanvasStage) can call zoomIn/zoomOut/fitToView.
 * Renders nothing.
 */
function ViewportControllerSink({
  controllerRef,
}: {
  controllerRef: React.MutableRefObject<ViewportController | null>
}) {
  const ctl = useViewportController()
  controllerRef.current = ctl
  return null
}

/**
 * Mirrors CanvasStage's decoded ImageData into App state so sidebar
 * panels (which sit outside CanvasStage's provider tree) can read it.
 * Renders nothing.
 */
function ImageDataSink({ onChange }: { onChange: (data: ImageData | null) => void }) {
  const data = useImageData()
  useEffect(() => {
    onChange(data)
  }, [data, onChange])
  return null
}

function AutoDetectConfigPanel({
  state,
  imageData,
  onOptionChange,
  onPrefixChange,
  onDetect,
  canCommit,
  onCommit,
  onCancel,
}: {
  state: AutoDetectState
  /** Decoded image pixels — null until the image finishes decoding. */
  imageData: ImageData | null
  onOptionChange: <K extends keyof Required<CCLOptions>>(
    key: K,
    value: Required<CCLOptions>[K],
  ) => void
  onPrefixChange: (prefix: string) => void
  onDetect: (detected: DetectedRect[]) => void
  canCommit: boolean
  onCommit: () => void
  onCancel: () => void
}) {
  const [running, setRunning] = useState(false)

  const detect = () => {
    if (!imageData) return
    setRunning(true)
    // Yield to the browser so the spinner can paint before the algorithm
    // ties up the main thread.
    setTimeout(() => {
      try {
        const detected = connectedComponents(imageData, state.options)
        onDetect(detected)
      } finally {
        setRunning(false)
      }
    }, 0)
  }

  return (
    <div {...stylex.props(s.slicePanel)}>
      <div {...stylex.props(s.sliceGrid)}>
        <span {...stylex.props(s.sliceLabel)}>Alpha ≥</span>
        <SliceNumField
          value={state.options.alphaThreshold}
          min={1}
          onChange={(n) => onOptionChange('alphaThreshold', Math.min(255, n))}
        />
        <span {...stylex.props(s.sliceLabel)}>Connect</span>
        <SliceNumField
          value={state.options.connectivity}
          min={4}
          onChange={(n) => onOptionChange('connectivity', n >= 8 ? 8 : 4)}
        />
        <span {...stylex.props(s.sliceLabel)}>Min px</span>
        <SliceNumField
          value={state.options.minPixels}
          min={1}
          onChange={(n) => onOptionChange('minPixels', n)}
        />
        <span {...stylex.props(s.sliceLabel)}>Min size</span>
        <SliceNumField
          value={state.options.minSize}
          min={1}
          onChange={(n) => onOptionChange('minSize', n)}
        />
      </div>

      <div {...stylex.props(s.sliceDivider)} />

      <div {...stylex.props(s.sliceCount)}>
        Detected {state.detected.length} · Picked {state.picked.size}
      </div>

      <div {...stylex.props(s.sliceGrid)}>
        <span {...stylex.props(s.sliceLabel)}>Name as</span>
        <input
          type="text"
          value={state.prefix}
          placeholder="sprite"
          spellCheck={false}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onPrefixChange(e.target.value)}
          {...stylex.props(s.sliceNumInput, s.sliceFieldFull)}
        />
      </div>

      <div {...stylex.props(s.sliceActions)}>
        <button
          type="button"
          {...stylex.props(s.sliceBtn, s.sliceBtnGhost)}
          disabled={running || !imageData}
          onClick={detect}
          title={imageData ? 'Run connected-component detection' : 'Image not loaded yet'}
        >
          {running ? 'Detecting…' : state.detected.length === 0 ? 'Detect' : 'Re-detect'}
        </button>
        <button
          type="button"
          {...stylex.props(s.sliceBtn)}
          disabled={!canCommit}
          onClick={onCommit}
          title={canCommit ? 'Commit picked rects as atlas frames (Enter)' : 'Detect, pick rects, and set a name to commit'}
        >
          Commit
        </button>
        <button
          type="button"
          {...stylex.props(s.sliceBtn, s.sliceBtnGhost)}
          onClick={onCancel}
          title="Discard detection and exit (Esc)"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Splitter({
  axis,
  onDrag,
}: {
  /**
   * 'horizontal' = a horizontal line dragged vertically (splits rows of a
   *   column).
   * 'vertical' = a vertical line dragged horizontally (splits columns of a
   *   row).
   */
  axis: 'horizontal' | 'vertical'
  onDrag: (clientPx: number) => void
}) {
  const draggingRef = useRef(false)
  return (
    <div
      role="separator"
      aria-orientation={axis}
      {...stylex.props(axis === 'horizontal' ? s.splitter : s.splitterV)}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        draggingRef.current = true
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return
        onDrag(axis === 'horizontal' ? e.clientY : e.clientX)
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
        draggingRef.current = false
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
    />
  )
}

// SliceNumField was replaced by the design-system <NumberField/> primitive
// which gives us VSCode-native styling, drag-handle inc/dec, and keyboard
// arrow support. Adapter component preserves the call sites' shape.
function SliceNumField({
  value,
  min,
  onChange,
}: {
  value: number
  min: number
  onChange: (n: number) => void
}) {
  return <NumberField value={value} min={min} onChange={(n) => onChange(Math.round(n))} />
}

function SliceConfigPanel({
  state,
  onParamsChange,
  onPrefixChange,
  canCommit,
  onCommit,
  onCancel,
}: {
  state: SliceState
  onParamsChange: (patch: Partial<SliceState>) => void
  onPrefixChange: (prefix: string) => void
  canCommit: boolean
  onCommit: () => void
  onCancel: () => void
}) {
  const cols = state.grid.colEdges.length - 1
  const rows = state.grid.rowEdges.length - 1
  const total = Math.max(0, cols * rows)
  return (
    <div {...stylex.props(s.slicePanel)}>
      <div {...stylex.props(s.sliceModeRow)}>
        <button
          type="button"
          {...stylex.props(s.sliceModeBtn, state.inputMode === 'pixels' && s.sliceModeBtnActive)}
          onClick={() => onParamsChange({ inputMode: 'pixels' })}
        >
          Cell W × H
        </button>
        <button
          type="button"
          {...stylex.props(s.sliceModeBtn, state.inputMode === 'cells' && s.sliceModeBtnActive)}
          onClick={() => onParamsChange({ inputMode: 'cells' })}
        >
          Cols × Rows
        </button>
      </div>

      <div {...stylex.props(s.sliceGrid)}>
        {state.inputMode === 'pixels' ? (
          <>
            <span {...stylex.props(s.sliceLabel)}>Cell W</span>
            <SliceNumField value={state.cellW} min={1} onChange={(n) => onParamsChange({ cellW: n })} />
            <span {...stylex.props(s.sliceLabel)}>Cell H</span>
            <SliceNumField value={state.cellH} min={1} onChange={(n) => onParamsChange({ cellH: n })} />
          </>
        ) : (
          <>
            <span {...stylex.props(s.sliceLabel)}>Cols</span>
            <SliceNumField
              value={state.cols || cols}
              min={1}
              onChange={(n) => onParamsChange({ cols: n })}
            />
            <span {...stylex.props(s.sliceLabel)}>Rows</span>
            <SliceNumField
              value={state.rows || rows}
              min={1}
              onChange={(n) => onParamsChange({ rows: n })}
            />
          </>
        )}
        <span {...stylex.props(s.sliceLabel)}>Offset X</span>
        <SliceNumField value={state.offsetX} min={0} onChange={(n) => onParamsChange({ offsetX: n })} />
        <span {...stylex.props(s.sliceLabel)}>Offset Y</span>
        <SliceNumField value={state.offsetY} min={0} onChange={(n) => onParamsChange({ offsetY: n })} />
        <span {...stylex.props(s.sliceLabel)}>Gutter X</span>
        <SliceNumField value={state.gutterX} min={0} onChange={(n) => onParamsChange({ gutterX: n })} />
        <span {...stylex.props(s.sliceLabel)}>Gutter Y</span>
        <SliceNumField value={state.gutterY} min={0} onChange={(n) => onParamsChange({ gutterY: n })} />
      </div>

      <div {...stylex.props(s.sliceDivider)} />

      <div {...stylex.props(s.sliceCount)}>
        Picked {state.picked.size} / {total} {cols}×{rows}
      </div>

      <div {...stylex.props(s.sliceGrid)}>
        <span {...stylex.props(s.sliceLabel)}>Name as</span>
        <input
          type="text"
          value={state.prefix}
          placeholder="frame"
          spellCheck={false}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onPrefixChange(e.target.value)}
          {...stylex.props(s.sliceNumInput, s.sliceFieldFull)}
        />
      </div>

      <div {...stylex.props(s.sliceActions)}>
        <button
          type="button"
          {...stylex.props(s.sliceBtn)}
          disabled={!canCommit}
          onClick={onCommit}
          title={canCommit ? 'Commit picked cells as atlas frames (Enter)' : 'Pick cells and set a name prefix to commit'}
        >
          Commit
        </button>
        <button
          type="button"
          {...stylex.props(s.sliceBtn, s.sliceBtnGhost)}
          onClick={onCancel}
          title="Discard slice and exit (Esc)"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
