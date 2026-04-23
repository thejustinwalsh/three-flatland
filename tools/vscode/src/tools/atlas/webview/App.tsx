import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import {
  Button,
  Panel,
  Toolbar,
  ToolbarButton,
  Divider,
  useCssVar,
} from '@three-flatland/design-system'
import { SpritePreview } from '@three-flatland/preview'

type InitPayload = { imageUri: string; fileName: string }

declare global {
  interface Window {
    __FL_ATLAS__?: InitPayload
  }
}

// One-shot boot-time dump of VSCode theme tokens we depend on.
// Shows up in the FL Tools output channel so we can confirm the webview
// is actually receiving the active theme's --vscode-* values.
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
        <strong style={{ fontWeight: 600, padding: '0 6px' }}>FL Sprite Atlas</strong>
        <Divider />
        <span style={{ color: 'var(--vscode-descriptionForeground)', padding: '0 6px' }}>
          {payload?.fileName ?? 'no file'}
        </span>
        <div style={{ flex: 1 }} />
        <ToolbarButton disabled label="Grid Slice" />
        <ToolbarButton disabled label="Auto Detect" />
        <Button disabled>Save</Button>
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
