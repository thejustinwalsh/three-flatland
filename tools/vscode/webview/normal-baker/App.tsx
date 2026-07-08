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
import { DragProvider, RectOverlay, useImageData, type Rect } from '@three-flatland/preview'
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
import { RegionColorOverlay } from './RegionColorOverlay'
import { RegionListPanel } from './RegionListPanel'
import { RegionPropertiesPanel } from './RegionPropertiesPanel'
import { DefaultsPanel } from './DefaultsPanel'
import { LivePreviewPanel } from './LivePreviewPanel'
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
  sidebar: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.md,
    overflow: 'auto',
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

  const bridgeRef = useRef<ReturnType<typeof createClientBridge> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const workAreaRef = useRef<HTMLDivElement>(null)
  const didLoadRef = useRef(false)
  const dirtySnapshotRef = useRef<string | null>(null)

  const SIDEBAR_MIN_PX = 240
  const SIDEBAR_MAX_PX = 480
  const handleSidebarDrag = useCallback((clientX: number) => {
    const el = workAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, rect.right - clientX))
    normalBakerActions.setRegionListPx(next)
  }, [])

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
        <span {...stylex.props(s.toolbarSpacer)} />
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
                <RegionColorOverlay regions={colorRegions} />
                <RectOverlay
                  rects={regions}
                  drawEnabled
                  onRectCreate={handleRectCreate}
                  selectedIds={selectedIds}
                  onSelectionChange={normalBakerActions.setSelectedIds}
                  onRectChange={handleRectChange}
                />
              </CanvasStage>
            </DragProvider>
          </Panel>
        </div>
        <Splitter axis="vertical" onDrag={handleSidebarDrag} />
        <div {...stylex.props(s.sidebar)}>
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
          <RegionPropertiesPanel
            region={selectedRegion}
            defaults={defaults}
            onChange={(next) => normalBakerActions.replaceRegion(next)}
          />
          <DefaultsPanel
            defaults={defaults}
            onChange={(patch) => normalBakerActions.setDefaults((prev) => ({ ...prev, ...patch }))}
          />
          <LivePreviewPanel imageData={imageData} descriptor={previewDescriptor} />
        </div>
      </div>
      <DevReloadToast />
    </div>
  )
}
