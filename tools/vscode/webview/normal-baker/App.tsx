import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { createClientBridge, getVSCodeApi } from '@three-flatland/bridge/client'
import {
  DevReloadToast,
  Panel,
  Splitter,
  Toolbar,
  ToolbarButton,
} from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import {
  DragProvider,
  GridSliceOverlay,
  RectOverlay,
  useImageData,
  type Rect,
} from '@three-flatland/preview'
import { cellKey, gridFromCellSize, type GridSpec } from '@three-flatland/preview/grid'
import type { NormalSourceDescriptor } from '@three-flatland/normals'

// Code-split the R3F + three.js + three-flatland chunk out of the initial
// paint critical path — same pattern as the atlas/merge tools. See
// tools/vscode/CLAUDE.md "Bundle size & loading".
const CanvasStage = lazy(() =>
  import('@three-flatland/preview/canvas').then((m) => ({ default: m.CanvasStage }))
)

import {
  normalBakerActions,
  normalBakerHistory,
  useNormalBakerDefaults,
  useNormalBakerHistoryStore,
  useNormalBakerRegions,
  useNormalBakerSelectedIds,
  useNormalBakerStore,
} from './normalBakerStore'
import { descriptorToState, stateToDescriptor } from './descriptorIO'
import { resolveDirection } from './fieldResolution'
import {
  childrenFromSplit,
  splitRegionByGrid,
  splitRegionRowsCols,
  tilesFromGrid,
  tilesFromPicked,
} from './gridOps'
import { GridSlicePanel, type GridSettings } from './GridSlicePanel'
import { InfoSection } from './InfoSection'
import { Inspector, inspectorHeading } from './Inspector'
import { LivePreview } from './LivePreviewPanel'
import { RegionColorOverlay } from './RegionColorOverlay'
import { RegionListPanel } from './RegionListPanel'
import { FIXTURE_DESCRIPTOR, FIXTURE_FILE_NAME, FIXTURE_IMAGE_DATA_URL } from './fixtures'

/**
 * Host→webview init payload. See README.md for the full bridge contract
 * this webview implements and the host-service agent should build
 * against.
 */
type InitPayload = {
  uri: string
  fileName: string
  descriptor?: NormalSourceDescriptor | null
  loadError?: string | null
}

declare global {
  interface Window {
    __FL_NORMAL_BAKER__?: InitPayload
  }
}

// ── Grid slice (C3) — session UI state, not undoable, not persisted:
// the grid is an ALIGNMENT AID; only the regions it generates are
// document content. Modeled as an editor MODE (Atlas's slicing idiom):
// entering swaps the Info panel for the Grid & Split panel, exiting
// returns to the inspector. `grid` materializes the numeric settings
// plus any hand-dragged edge tweaks; a settings/image change rebuilds
// it (and clears picks — cell keys are grid-shape-relative).
type GridState = {
  settings: GridSettings
  grid: GridSpec | null
  picked: ReadonlySet<string>
  splitRows: number
  splitCols: number
}

type EditorMode = { kind: 'normal' } | { kind: 'grid'; state: GridState }

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
    padding: space.lg,
  },
  workAreaCols: (sidebarPx: number) => ({
    gridTemplateColumns: `minmax(200px, 1fr) 4px ${sidebarPx}px`,
  }),
  canvasPanel: {
    minWidth: 0,
    minHeight: 0,
  },
  canvasStagePanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
  },
  // Regions (list) / splitter / Info (inspector + preview) rows — the
  // 4px splitter is the only inter-panel gap (no grid gap on top of it,
  // per tools/vscode/CLAUDE.md's panel-spacing rule). Both rows keep a
  // floor so neither can be collapsed away entirely.
  sidebar: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
  },
  sidebarRows: (infoPx: number) => ({
    gridTemplateRows: `minmax(120px, 1fr) 4px minmax(0, ${infoPx}px)`,
  }),
  // Fills the Info grid row; the Panel body owns the scroll.
  infoPanel: {
    height: '100%',
    minHeight: 0,
  },
  infoBody: {
    display: 'flex',
    flexDirection: 'column',
  },
  errorBanner: {
    padding: space.md,
    backgroundColor: vscode.errorBg,
    color: vscode.errorFg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.errorBorder,
    fontSize: '12px',
    flexShrink: 0,
  },
  // Toolbar save-status readout, next to the Save button. Doubles as the
  // e2e-observable completion signal for the async bridge round-trip (see
  // handleSave) — this text only renders once `normalBaker/save` has
  // resolved, so a test can await it instead of polling the filesystem.
  saveStatusText: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    paddingInlineEnd: space.md,
    display: 'flex',
    alignItems: 'center',
  },
  saveStatusTextError: {
    fontSize: '11px',
    color: vscode.errorFg,
    paddingInlineEnd: space.md,
    display: 'flex',
    alignItems: 'center',
  },
})

/** Mounted inside `<CanvasStage>` to surface its decoded ImageData up to App-level state (App renders sibling panels outside CanvasStage's provider tree). Same pattern as atlas's `<ImageDataSink>`. */
function ImageDataSink({ onChange }: { onChange: (data: ImageData | null) => void }) {
  const data = useImageData()
  useEffect(() => onChange(data), [data, onChange])
  return null
}

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(
    () => window.__FL_NORMAL_BAKER__ ?? null
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  // Gates Save (button + Cmd/Ctrl+S) until the initial descriptor has
  // actually landed. The Toolbar mounts and the Save button becomes
  // clickable well before the async normalBaker/ready → normalBaker/init
  // bridge round-trip resolves — without this gate, a fast click (or a
  // reflexive Cmd+S right after opening) would save the store's still-empty
  // initial `regions: []` over the user's existing sidecar.
  const [ready, setReady] = useState(false)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  const regions = useNormalBakerRegions()
  const defaults = useNormalBakerDefaults()
  const selectedIds = useNormalBakerSelectedIds()
  const historyState = useNormalBakerHistoryStore()
  const canUndo = historyState.pastStates.length > 0
  const canRedo = historyState.futureStates.length > 0
  const sidebarPx = useNormalBakerStore((store) => store.regionListPx)
  const infoPanelPx = useNormalBakerStore((store) => store.splits.infoPanelPx)

  const [mode, setMode] = useState<EditorMode>({ kind: 'normal' })
  const gridState = mode.kind === 'grid' ? mode.state : null

  const materializeGrid = useCallback(
    (settings: GridSettings): GridSpec | null =>
      imageSize
        ? gridFromCellSize(
            imageSize.w,
            imageSize.h,
            settings.tileW,
            settings.tileH,
            settings.offsetX,
            settings.offsetY
          )
        : null,
    [imageSize]
  )

  // Unlike Atlas's enterSlice we do NOT bail before the image has
  // decoded — grid mode can be entered immediately and the grid
  // materializes via the imageSize effect below. Selection is kept:
  // split-by-grid works from a list selection while the grid is up.
  const enterGrid = useCallback(() => {
    const settings: GridSettings = { tileW: 16, tileH: 16, offsetX: 0, offsetY: 0 }
    setMode({
      kind: 'grid',
      state: {
        settings,
        grid: materializeGrid(settings),
        picked: new Set(),
        splitRows: 2,
        splitCols: 2,
      },
    })
  }, [materializeGrid])

  const exitGrid = useCallback(() => {
    setMode({ kind: 'normal' })
  }, [])

  const updateGrid = useCallback((updater: (prev: GridState) => GridState) => {
    setMode((m) => (m.kind === 'grid' ? { kind: 'grid', state: updater(m.state) } : m))
  }, [])

  // Image (re)decode while grid mode is up → rebuild the grid from the
  // current settings; picks are cleared (cell keys are grid-shape-relative).
  useEffect(() => {
    setMode((m) =>
      m.kind === 'grid'
        ? {
            kind: 'grid',
            state: { ...m.state, grid: materializeGrid(m.state.settings), picked: new Set() },
          }
        : m
    )
  }, [materializeGrid])

  const handleGridSettingsChange = useCallback(
    (patch: Partial<GridSettings>) => {
      updateGrid((prev) => {
        const settings = { ...prev.settings, ...patch }
        return { ...prev, settings, grid: materializeGrid(settings), picked: new Set() }
      })
    },
    [materializeGrid, updateGrid]
  )

  const bridgeRef = useRef<ReturnType<typeof createClientBridge> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const workAreaRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const didLoadRef = useRef(false)
  const dirtySnapshotRef = useRef<string | null>(null)

  // Sidebar width = distance from cursor to the work area's right edge;
  // Info height = distance from cursor to the sidebar's bottom edge.
  // Both setters clamp inside the store (encode's splits pattern).
  const handleSidebarDrag = useCallback((clientX: number) => {
    const el = workAreaRef.current
    if (!el) return
    normalBakerActions.setRegionListPx(el.getBoundingClientRect().right - clientX)
  }, [])

  // The store's 160–640 clamp alone is not enough for the Info height: a
  // real editor panel is usually SHORTER than 640px + the Regions floor,
  // so an unbounded-up drag parks the STORED height far above what the
  // `minmax(0, …)` grid row can render — the splitter pins at the visual
  // limit while the store keeps counting, then the panel snaps on the
  // next layout change. Clamp against the sidebar's live height (Regions
  // keeps its 120px floor + the 4px splitter row), same as the atlas
  // width-splitter's live-bounds clamp — clamping is the parent's job
  // per the design-system Splitter contract.
  const infoPanelMax = useCallback((): number => {
    const el = sidebarRef.current
    if (!el) return 640
    return Math.max(160, el.getBoundingClientRect().height - 120 - 4)
  }, [])

  const handleInfoDrag = useCallback(
    (clientY: number) => {
      const el = sidebarRef.current
      if (!el) return
      const next = el.getBoundingClientRect().bottom - clientY
      normalBakerActions.setInfoPanelPx(Math.min(next, infoPanelMax()))
    },
    [infoPanelMax]
  )

  // Keep the stored height truthful across sidebar resizes (window
  // resize, editor-group layout changes): re-clamp so stored === rendered
  // and the next drag starts exactly where the splitter sits.
  useEffect(() => {
    const el = sidebarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const current = useNormalBakerStore.getState().splits.infoPanelPx
      const max = infoPanelMax()
      if (current > max) normalBakerActions.setInfoPanelPx(max)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [infoPanelMax])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // Bridge handshake, with a standalone-dev-mode fallback for opening
  // dist/webview/normal-baker/index.html directly (no acquireVsCodeApi —
  // e.g. after `vite build --watch`, outside VSCode). See README.md.
  useEffect(() => {
    let inWebview = true
    try {
      getVSCodeApi()
    } catch {
      inWebview = false
    }

    if (!inWebview) {
      const fixturePayload: InitPayload = {
        uri: FIXTURE_IMAGE_DATA_URL,
        fileName: FIXTURE_FILE_NAME,
        descriptor: FIXTURE_DESCRIPTOR,
      }
      setPayload(fixturePayload)
      if (!didLoadRef.current) {
        didLoadRef.current = true
        const { regions: r, defaults: d } = descriptorToState(fixturePayload.descriptor)
        normalBakerActions.loadFromInit(r, d)
        dirtySnapshotRef.current = JSON.stringify({ r, d })
      }
      setReady(true)
      return
    }

    const bridge = createClientBridge()
    bridgeRef.current = bridge
    const off = bridge.on<InitPayload>('normalBaker/init', (p) => {
      setPayload(p)
      if (!didLoadRef.current) {
        didLoadRef.current = true
        const { regions: r, defaults: d } = descriptorToState(p.descriptor)
        normalBakerActions.loadFromInit(r, d)
        dirtySnapshotRef.current = JSON.stringify({ r, d })
      }
      if (p.loadError) setLoadError(p.loadError)
      setReady(true)
    })
    void bridge.request('normalBaker/ready')
    return off
  }, [])

  // Dirty tracking — pings the host whenever the document content
  // (regions/defaults) diverges from what was last loaded or saved.
  // Best-effort: the host-service handler for this message lands in a
  // separate unit, so a rejected/missing handler is swallowed.
  useEffect(() => {
    const snapshot = JSON.stringify({ r: regions, d: defaults })
    const isDirty = dirtySnapshotRef.current !== null && dirtySnapshotRef.current !== snapshot
    const bridge = bridgeRef.current
    if (!bridge) return
    void bridge.request('normalBaker/dirty', { isDirty }).catch(() => {})
  }, [regions, defaults])

  const handleSave = useCallback(async () => {
    const bridge = bridgeRef.current
    // `!ready` is the defensive check that matters here — see the `ready`
    // state's doc comment: without it, a save fired before the initial
    // descriptor lands would overwrite the sidecar with the store's empty
    // starting state.
    if (!bridge || !ready) return
    setSaveStatus({ kind: 'saving' })
    try {
      const descriptor = stateToDescriptor(regions, defaults)
      await bridge.request('normalBaker/save', { descriptor, options: {} })
      dirtySnapshotRef.current = JSON.stringify({ r: regions, d: defaults })
      setSaveStatus({ kind: 'saved', at: Date.now() })
    } catch (err) {
      setSaveStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [regions, defaults, ready])

  const handleRectCreate = useCallback((r: Rect) => {
    // `Rect` (id, x, y, w, h, name?) satisfies `EditableRegion`'s required
    // shape directly — a freshly drawn region has no bump/direction/pitch/
    // strength/elevation override yet, which is exactly what's wanted.
    normalBakerActions.addRegion(r)
  }, [])

  const handleRectChange = useCallback(
    (id: string, next: { x: number; y: number; w: number; h: number }) => {
      normalBakerActions.updateRegion(id, next)
    },
    []
  )

  const handleAddRegionFromPanel = useCallback(() => {
    const w = imageSize ? Math.min(32, imageSize.w) : 32
    const h = imageSize ? Math.min(32, imageSize.h) : 32
    const x = imageSize ? Math.max(0, Math.round((imageSize.w - w) / 2)) : 0
    const y = imageSize ? Math.max(0, Math.round((imageSize.h - h) / 2)) : 0
    normalBakerActions.addRegion({ id: crypto.randomUUID(), x, y, w, h })
  }, [imageSize])

  const handleCellSet = useCallback(
    (row: number, col: number, isPicked: boolean) => {
      updateGrid((prev) => {
        const picked = new Set(prev.picked)
        const key = cellKey(row, col)
        if (isPicked) picked.add(key)
        else picked.delete(key)
        return { ...prev, picked }
      })
    },
    [updateGrid]
  )

  const handleGenerate = useCallback(() => {
    if (!gridState?.grid) return
    const { grid, picked } = gridState
    const tiles = picked.size > 0 ? tilesFromPicked(grid, picked) : tilesFromGrid(grid)
    if (tiles.length === 0) return
    // ONE undo step for the whole batch (addRegionsAction is a single
    // set()); the generated regions come back selected, so a mass delete
    // is the immediate escape hatch alongside undo.
    normalBakerActions.addRegions(tiles.map((t) => ({ id: crypto.randomUUID(), ...t })))
    updateGrid((prev) => ({ ...prev, picked: new Set() }))
  }, [gridState, updateGrid])

  const selectedRegion = useMemo(
    () =>
      selectedIds.size === 1 ? (regions.find((r) => r.id === [...selectedIds][0]) ?? null) : null,
    [regions, selectedIds]
  )

  const colorRegions = useMemo(
    () =>
      regions.map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        direction: resolveDirection(r, defaults),
      })),
    [regions, defaults]
  )

  const previewDescriptor = useMemo(() => stateToDescriptor(regions, defaults), [regions, defaults])

  // Split — Photoshop-slice style: children replace the parent at its
  // paint-order position and inherit its EXPLICIT fields (N4 fidelity
  // semantics — see gridOps.ts's childrenFromSplit). One undo step.
  const handleSplitByGrid = useCallback(() => {
    const grid = gridState?.grid
    if (!grid || !selectedRegion) return
    const tiles = splitRegionByGrid(selectedRegion, grid)
    if (tiles.length < 2) return
    normalBakerActions.splitRegion(
      selectedRegion.id,
      childrenFromSplit(selectedRegion, tiles, () => crypto.randomUUID())
    )
  }, [gridState, selectedRegion])

  const handleSplitRowsCols = useCallback(() => {
    if (!selectedRegion || !gridState) return
    const tiles = splitRegionRowsCols(selectedRegion, gridState.splitRows, gridState.splitCols)
    if (tiles.length < 2) return
    normalBakerActions.splitRegion(
      selectedRegion.id,
      childrenFromSplit(selectedRegion, tiles, () => crypto.randomUUID())
    )
  }, [gridState, selectedRegion])

  // Undo / redo hotkeys.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        normalBakerHistory.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        normalBakerHistory.redo()
      } else if (e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  return (
    <div ref={rootRef} tabIndex={-1} {...stylex.props(s.root)}>
      <Toolbar>
        <ToolbarButton
          icon="discard"
          title="Undo"
          onClick={normalBakerHistory.undo}
          disabled={!canUndo}
        />
        <ToolbarButton
          icon="redo"
          title="Redo"
          onClick={normalBakerHistory.redo}
          disabled={!canRedo}
        />
        <ToolbarButton
          icon="symbol-ruler"
          title="Grid Slice"
          toggleable
          checked={mode.kind === 'grid'}
          onClick={() => (mode.kind === 'grid' ? exitGrid() : enterGrid())}
        />
        <span {...stylex.props(s.toolbarSpacer)} />
        {saveStatus.kind === 'saved' ? (
          <span {...stylex.props(s.saveStatusText)}>Saved</span>
        ) : saveStatus.kind === 'error' ? (
          <span {...stylex.props(s.saveStatusTextError)} title={saveStatus.message}>
            Save failed
          </span>
        ) : null}
        <ToolbarButton
          icon="save"
          title="Save (.normal.png + .normal.json)"
          onClick={() => void handleSave()}
          disabled={!ready || saveStatus.kind === 'saving'}
        />
      </Toolbar>
      {loadError ? (
        <div {...stylex.props(s.errorBanner)}>Sidecar load failed: {loadError}</div>
      ) : null}
      <div ref={workAreaRef} {...stylex.props(s.workArea, s.workAreaCols(sidebarPx))}>
        <div {...stylex.props(s.canvasPanel)}>
          <Panel bodyPadding="none" style={s.canvasStagePanel}>
            <DragProvider>
              <CanvasStage
                imageUri={payload?.uri ?? null}
                onImageReady={setImageSize}
                backgroundStyle="checker"
              >
                <ImageDataSink onChange={setImageData} />
                <RegionColorOverlay regions={colorRegions} selectedIds={selectedIds} />
                {/* Grid mode: the grid overlay owns the canvas pointer
                    surface (line drags + cell picking), so rect drawing/
                    editing pauses — regions stay visible underneath, and
                    the LIST still selects (split-by-grid works from a
                    list selection while the grid is up). */}
                {/* showLabels={false}: labels are drawn by
                    RegionColorOverlay instead, with the baker's
                    fit-ALWAYS policy (see regionLabelFit.ts) rather than
                    preview's fit-or-hide. */}
                <RectOverlay
                  rects={regions}
                  showLabels={false}
                  drawEnabled={mode.kind === 'normal'}
                  interactive={mode.kind === 'normal'}
                  onRectCreate={handleRectCreate}
                  selectedIds={selectedIds}
                  onSelectionChange={normalBakerActions.setSelectedIds}
                  onRectChange={handleRectChange}
                />
                {gridState?.grid ? (
                  <GridSliceOverlay
                    grid={gridState.grid}
                    picked={gridState.picked}
                    onGridChange={(grid) => updateGrid((prev) => ({ ...prev, grid }))}
                    onCellSet={handleCellSet}
                  />
                ) : null}
              </CanvasStage>
            </DragProvider>
          </Panel>
        </div>
        <Splitter axis="vertical" onDrag={handleSidebarDrag} />
        <div ref={sidebarRef} {...stylex.props(s.sidebar, s.sidebarRows(infoPanelPx))}>
          <RegionListPanel
            regions={regions}
            defaults={defaults}
            selectedIds={selectedIds}
            onSelect={(id, additive) =>
              normalBakerActions.setSelectedIds((prev) => {
                if (!additive) return new Set([id])
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
            onAdd={handleAddRegionFromPanel}
            onDelete={normalBakerActions.removeSelected}
            onMove={normalBakerActions.reorderRegion}
          />
          <Splitter axis="horizontal" onDrag={handleInfoDrag} />
          {/* Grid mode swaps the Info panel for the Grid & Split tool
              panel (Atlas's mode-driven sub-tool idiom); exiting
              returns to the inspector + preview. */}
          {gridState ? (
            <Panel
              title={`Grid & Split${gridState.picked.size > 0 ? ` (${gridState.picked.size} picked)` : ''}`}
              bodyPadding="none"
              style={s.infoPanel}
            >
              <GridSlicePanel
                grid={gridState.grid}
                picked={gridState.picked}
                settings={gridState.settings}
                onSettingsChange={handleGridSettingsChange}
                selectedRegion={selectedRegion}
                selectionCount={selectedIds.size}
                splitRows={gridState.splitRows}
                splitCols={gridState.splitCols}
                onSplitRowsChange={(rows) => updateGrid((prev) => ({ ...prev, splitRows: rows }))}
                onSplitColsChange={(cols) => updateGrid((prev) => ({ ...prev, splitCols: cols }))}
                onGenerate={handleGenerate}
                onSplitByGrid={handleSplitByGrid}
                onSplitRowsCols={handleSplitRowsCols}
              />
            </Panel>
          ) : (
            <Panel title="Info" bodyPadding="none" style={s.infoPanel}>
              <div {...stylex.props(s.infoBody)}>
                <InfoSection
                  id="inspector"
                  heading={inspectorHeading(selectedRegion, selectedIds.size)}
                >
                  <Inspector
                    region={selectedRegion}
                    selectionCount={selectedIds.size}
                    defaults={defaults}
                    onRegionChange={(next) => normalBakerActions.replaceRegion(next)}
                    onDefaultsChange={(patch) =>
                      normalBakerActions.setDefaults((prev) => ({ ...prev, ...patch }))
                    }
                  />
                </InfoSection>
                {/* Renders its own two InfoSections (Normal, Lit) —
                    independently collapsible, one shared bake. */}
                <LivePreview imageData={imageData} descriptor={previewDescriptor} />
              </div>
            </Panel>
          )}
        </div>
      </div>
      <DevReloadToast />
    </div>
  )
}
