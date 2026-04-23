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
    'editorWidget-background',
    'editorWidget-border',
    'panel-background',
    'panel-border',
    'panelTitle-activeForeground',
    'button-background',
    'button-foreground',
    'button-hoverBackground',
    'focusBorder',
    'font-family',
    'font-size',
  ] as const
  const report: Record<string, string> = {}
  for (const k of keys) report[k] = styles.getPropertyValue(`--vscode-${k}`).trim()
  report['body.classList'] = document.body.className
  console.info('[FL Atlas] theme tokens', report)
}

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)
  const [rects, setRects] = useState<Rect[]>([])
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
  }, [])

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
          title="Draw Rect"
          toggleable
          checked={tool === 'rect'}
          onClick={() => setTool('rect')}
        />
        <ToolbarButton
          icon="selection"
          title="Select"
          toggleable
          checked={tool === 'select'}
          onClick={() => setTool('select')}
        />
        <ToolbarButton
          icon="move"
          title="Move"
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
          icon="clear-all"
          title="Clear All Rects"
          onClick={() => setRects([])}
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
              />
            </CanvasStage>
          </div>
        </Panel>
        <Panel title={`Frames (${rects.length})`}>
          {rects.length === 0 ? (
            <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
              Draw rects with the <i className="codicon codicon-add" /> tool.
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
              {rects.map((r, i) => (
                <li
                  key={r.id}
                  style={{
                    padding: '4px 6px',
                    borderBottom: '1px solid var(--vscode-panel-border, transparent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>#{i}</span>
                  <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
                    {r.x},{r.y} · {r.w}×{r.h}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <DevReloadToast />
    </div>
  )
}
