import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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

type InitPayload = { imageUri: string; fileName: string }

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

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)
  const [rects, setRects] = useState<Rect[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<Tool>('rect')
  const [renameMode, setRenameMode] = useState<RenameMode>({ kind: 'none' })
  const [prefixDraft, setPrefixDraft] = useState('')
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')

  const indexById = useMemo(() => {
    const m = new Map<string, number>()
    rects.forEach((r, i) => m.set(r.id, i))
    return m
  }, [rects])

  useEffect(() => {
    dumpThemeTokens()
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('atlas/init', (p) => setPayload(p))
    void bridge.request('atlas/ready')
    return off
  }, [])

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
        if (rects.length === 0) return
        selectAll()
        e.preventDefault()
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, rects, renameMode, clearSelection, deleteSelected, selectAll, startRename])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--vscode-editor-background)',
        color: 'var(--vscode-foreground)',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)',
      }}
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
        <div style={{ flex: 1 }} />
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
        <ToolbarButton icon="save" title="Save" />
      </Toolbar>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: 8,
          padding: 8,
        }}
      >
        <Panel title="Preview">
          <div style={{ flex: 1, minHeight: 0 }}>
            <CanvasStage imageUri={payload?.imageUri ?? null} background={editorBg}>
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
            <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
              Draw rects with the <i className="codicon codicon-add" /> tool{' '}
              <span style={{ opacity: 0.6 }}>(R)</span>.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                overflowY: 'auto',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: 12,
              }}
            >
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
                    style={{
                      padding: '4px 6px',
                      cursor: editing ? 'text' : 'pointer',
                      background: sel
                        ? 'var(--vscode-list-activeSelectionBackground, transparent)'
                        : 'transparent',
                      color: sel
                        ? 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))'
                        : 'var(--vscode-foreground)',
                      borderBottom: '1px solid var(--vscode-panel-border, transparent)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
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
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName}
                      </span>
                    )}
                    <span style={{ opacity: 0.7, flex: '0 0 auto' }}>
                      {r.x},{r.y} · {r.w}×{r.h}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
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
      style={{
        flex: 1,
        minWidth: 0,
        padding: '2px 4px',
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-focusBorder, transparent)',
        outline: 'none',
        fontFamily: 'var(--vscode-editor-font-family)',
        fontSize: 12,
      }}
    />
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
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        padding: '6px 4px',
        marginBottom: 8,
        borderBottom: '1px solid var(--vscode-panel-border, transparent)',
      }}
    >
      <span style={{ color: 'var(--vscode-descriptionForeground)', whiteSpace: 'nowrap' }}>
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
        style={{
          flex: 1,
          minWidth: 0,
          padding: '2px 4px',
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-focusBorder, transparent)',
          outline: 'none',
          fontFamily: 'var(--vscode-editor-font-family)',
          fontSize: 12,
        }}
      />
      <span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>{value || 'name'}_0 …</span>
    </div>
  )
}
