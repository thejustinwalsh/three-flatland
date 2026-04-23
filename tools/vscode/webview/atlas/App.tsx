import { useCallback, useEffect, useState } from 'react'
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

function dumpThemeTokens() {
  const styles = getComputedStyle(document.body)
  const keys = [
    'foreground',
    'descriptionForeground',
    'editor-background',
    'editor-foreground',
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
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    t.isContentEditable
  )
}

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)
  const [rects, setRects] = useState<Rect[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tool, setTool] = useState<Tool>('rect')
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')

  useEffect(() => {
    dumpThemeTokens()
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('atlas/init', (p) => setPayload(p))
    void bridge.request('atlas/ready')
    return off
  }, [])

  const handleRectCreate = useCallback((r: Rect) => {
    setRects((prev) => [...prev, r])
    // Select the newly-created rect so the frame list scrolls to it and
    // rename/delete operate on the user's latest work without extra clicks.
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

  // Keyboard shortcuts — only consume keys we actually act on. Everything
  // else passes through to the browser / editor host.
  //   R — rect tool         S — select tool         M — move tool
  //   Escape — deselect (no-op when selection empty)
  //   Delete/Backspace — remove selected (no-op when selection empty)
  //   Ctrl/Cmd+A — select all (no-op when no rects)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey

      // Editing shortcuts — preventDefault only if we actually do something
      // so empty-state Backspace still triggers browser back-nav / etc.
      if (e.key === 'Escape') {
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

      // Tool switches — skip when a modifier is held so we don't collide
      // with system shortcuts. No preventDefault; R/S/M have no browser
      // default action, and consuming them would break future users of
      // these keys downstream.
      if (mod || e.altKey || e.shiftKey) return
      const k = e.key.toLowerCase()
      if (k === 'r') setTool('rect')
      else if (k === 's') setTool('select')
      else if (k === 'm') setTool('move')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, rects, clearSelection, deleteSelected, selectAll])

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
        <ToolbarButton icon="symbol-array" title="Frames" />
        <ToolbarButton icon="run-all" title="Animations" />
        <div style={{ flex: 1 }} />
        <ToolbarButton icon="zoom-in" title="Zoom In" />
        <ToolbarButton icon="zoom-out" title="Zoom Out" />
        <ToolbarButton icon="screen-full" title="Fit" />
        <Divider />
        <ToolbarButton
          icon="trash"
          title="Delete Selected  (Del)"
          onClick={deleteSelected}
        />
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
          {rects.length === 0 ? (
            <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
              Draw rects with the <i className="codicon codicon-add" /> tool <span style={{ opacity: 0.6 }}>(R)</span>.
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
                return (
                  <li
                    key={r.id}
                    onClick={(e) => {
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
                    style={{
                      padding: '4px 6px',
                      cursor: 'pointer',
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
                    }}
                  >
                    <span>#{i}</span>
                    <span style={{ color: 'inherit', opacity: 0.7 }}>
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
}
