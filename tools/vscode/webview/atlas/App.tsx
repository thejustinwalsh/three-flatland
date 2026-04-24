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
  DevReloadToast,
  Divider,
  Panel,
  Toolbar,
  ToolbarButton,
  useCssVar,
} from '@three-flatland/design-system'
import { CanvasStage, RectOverlay, type Rect } from '@three-flatland/preview'
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
    gridTemplateColumns: 'minmax(0, 1fr) 280px',
    gap: space.lg,
    padding: space.lg,
  },
  previewWrap: { flex: 1, minHeight: 0 },
  emptyState: { color: vscode.descriptionFg },
  hintDim: { opacity: 0.6 },
  frameList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
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
    gap: space.lg,
  },
  frameItemSelected: {
    backgroundColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
  },
  frameItemEditing: { cursor: 'text' },
  frameName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
})

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)
  const [rects, setRects] = useState<Rect[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<Tool>('rect')
  const [renameMode, setRenameMode] = useState<RenameMode>({ kind: 'none' })
  const [prefixDraft, setPrefixDraft] = useState('')
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [saveStatus, setSaveStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'saving' }
    | { kind: 'saved'; at: number; path: string; count: number }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })
  const bridgeRef = useRef<ReturnType<typeof createClientBridge> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')

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

  // Keyboard — only consumes keys we handle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
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
  }, [selectedIds, rects, renameMode, clearSelection, deleteSelected, selectAll, startRename, handleSave])

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onPointerDown={handleRootPointerDown}
      {...stylex.props(s.root)}
    >
      <Toolbar>
        <ToolbarButton icon="symbol-ruler" title="Grid Slice" />
        <ToolbarButton icon="wand" title="Auto Detect Sprites" />
        <Divider />
        <ToolbarButton
          icon="add"
          title="Draw Rect  (R)"
          toggleable
          checked={tool === 'rect'}
          onClick={() => setTool('rect')}
        />
        <ToolbarButton
          icon="selection"
          title="Select  (S)"
          toggleable
          checked={tool === 'select'}
          onClick={() => setTool('select')}
        />
        <ToolbarButton
          icon="move"
          title="Move  (M)"
          toggleable
          checked={tool === 'move'}
          onClick={() => setTool('move')}
        />
        <Divider />
        <ToolbarButton
          icon="symbol-string"
          title="Rename / Auto-name  (N)"
          onClick={startRename}
        />
        <ToolbarButton icon="run-all" title="Animations" />
        <div {...stylex.props(s.toolbarSpacer)} />
        <ToolbarButton icon="zoom-in" title="Zoom In" />
        <ToolbarButton icon="zoom-out" title="Zoom Out" />
        <ToolbarButton icon="screen-full" title="Fit" />
        <Divider />
        <ToolbarButton icon="trash" title="Delete Selected  (Del)" onClick={deleteSelected} />
        <ToolbarButton
          icon="clear-all"
          title="Clear All Rects"
          onClick={() => {
            setRects([])
            setSelectedIds(new Set())
          }}
        />
        <ToolbarButton
          icon={saveStatus.kind === 'saving' ? 'loading' : 'save'}
          title="Save Atlas  (⌘S)"
          onClick={() => void handleSave()}
        />
      </Toolbar>

      <div {...stylex.props(s.workArea)}>
        <Panel title="Preview">
          <div {...stylex.props(s.previewWrap)}>
            <CanvasStage
              imageUri={payload?.imageUri ?? null}
              background={editorBg}
              onImageReady={setImageSize}
            >
              <RectOverlay
                rects={rects}
                drawEnabled={tool === 'rect'}
                onRectCreate={handleRectCreate}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            </CanvasStage>
          </div>
        </Panel>

        <Panel title={`Frames (${rects.length}${selectedIds.size > 0 ? ` · ${selectedIds.size} sel` : ''})`}>
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
              Draw rects with the <i className="codicon codicon-add" /> tool{' '}
              <span {...stylex.props(s.hintDim)}>(R)</span>.
            </div>
          ) : (
            <ul {...stylex.props(s.frameList)}>
              {rects.map((r, i) => {
                const sel = selectedIds.has(r.id)
                const editing = renameMode.kind === 'inline' && renameMode.id === r.id
                const displayName = r.name ?? `#${i}`
                return (
                  <li
                    key={r.id}
                    onClick={(e) => {
                      if (editing) return
                      const next = new Set(selectedIds)
                      if (e.shiftKey) {
                        if (next.has(r.id)) next.delete(r.id)
                        else next.add(r.id)
                      } else {
                        next.clear()
                        next.add(r.id)
                      }
                      setSelectedIds(next)
                    }}
                    onDoubleClick={() => {
                      setSelectedIds(new Set([r.id]))
                      setRenameMode({ kind: 'inline', id: r.id })
                    }}
                    {...stylex.props(
                      s.frameItem,
                      sel && s.frameItemSelected,
                      editing && s.frameItemEditing,
                    )}
                  >
                    {editing ? (
                      <InlineRenameInput
                        initial={r.name ?? ''}
                        placeholder={`#${i}`}
                        onCommit={(name) => {
                          renameRect(r.id, name)
                          setRenameMode({ kind: 'none' })
                        }}
                        onCancel={() => setRenameMode({ kind: 'none' })}
                      />
                    ) : (
                      <span {...stylex.props(s.frameName)}>
                        {displayName}
                      </span>
                    )}
                    <span {...stylex.props(s.frameCoords)}>
                      {r.x},{r.y} · {r.w}×{r.h}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
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
