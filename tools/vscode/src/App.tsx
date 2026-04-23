import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import { Panel, Toolbar, ToolbarButton, Divider, useCssVar } from '@three-flatland/design-system'
import { SpritePreview } from '@three-flatland/preview'

type InitPayload = { imageUri: string; fileName: string }

declare global {
  interface Window {
    __FL_ATLAS__?: InitPayload
  }
}

// One-shot boot-time dump of VSCode theme tokens we depend on. Surfaces in
// the FL Tools output channel so theme coverage is diagnosable.
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
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')

  useEffect(() => {
    dumpThemeTokens()
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('atlas/init', (p) => setPayload(p))
    void bridge.request('atlas/ready')
    return off
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
        <ToolbarButton icon="add" title="New Rect" />
        <ToolbarButton icon="selection" title="Select" />
        <ToolbarButton icon="move" title="Move" />
        <Divider />
        <ToolbarButton icon="symbol-array" title="Frames" />
        <ToolbarButton icon="run-all" title="Animations" />
        <div style={{ flex: 1 }} />
        <ToolbarButton icon="zoom-in" title="Zoom In" />
        <ToolbarButton icon="zoom-out" title="Zoom Out" />
        <ToolbarButton icon="screen-full" title="Fit" />
        <Divider />
        <ToolbarButton icon="refresh" title="Reload" />
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
            <SpritePreview imageUri={payload?.imageUri ?? null} background={editorBg} />
          </div>
        </Panel>
        <Panel title="Frames">
          <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
            No frames yet. Slicing tools land in Phase 2.
          </div>
        </Panel>
      </div>
    </div>
  )
}
