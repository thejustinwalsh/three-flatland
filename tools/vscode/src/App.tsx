import { useEffect, useMemo, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import { Panel, Toolbar, ToolbarButton, Divider, useCssVar } from '@three-flatland/design-system'
import { SpritePreview } from '@three-flatland/preview'

type InitPayload = {
  bytes: number[] | Uint8Array
  mime: string
  fileName: string
}

declare global {
  interface Window {
    __FL_ATLAS__?: { fileName: string }
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
  const [payload, setPayload] = useState<InitPayload | null>(null)
  const editorBg = useCssVar('--vscode-editor-background', '#1e1e1e')

  // Wrap the bytes in a same-origin blob URL so three-flatland's
  // TextureLoader can fetch them without crossing origins. Works in both
  // dev-iframe and prod-webview contexts.
  const imageUri = useMemo(() => {
    if (!payload) return null
    const bytes = payload.bytes instanceof Uint8Array
      ? payload.bytes
      : new Uint8Array(payload.bytes)
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: payload.mime })
    return URL.createObjectURL(blob)
  }, [payload])

  useEffect(() => {
    return () => {
      if (imageUri) URL.revokeObjectURL(imageUri)
    }
  }, [imageUri])

  useEffect(() => {
    dumpThemeTokens()
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('atlas/init', (p) => {
      console.info('[FL Atlas] atlas/init received:', {
        fileName: p.fileName,
        mime: p.mime,
        byteCount: (p.bytes as { length: number }).length,
        firstBytes: Array.from(p.bytes).slice(0, 8),
      })
      setPayload(p)
    })
    void bridge.request('atlas/ready').then(() => {
      console.info('[FL Atlas] atlas/ready request resolved')
    }).catch((err) => {
      console.error('[FL Atlas] atlas/ready request failed:', err)
    })
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
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <SpritePreview imageUri={imageUri} background={editorBg} />
            {/* Diagnostic img probe. If this loads but the Canvas sprite
                doesn't, the failure is in three.js TextureLoader, not the
                blob URL / bytes / CSP. If this also fails, the bytes
                aren't arriving or the URL is wrong. Remove once stable. */}
            {imageUri ? (
              <img
                src={imageUri}
                alt={payload?.fileName ?? ''}
                onLoad={() => console.info('[FL Atlas] <img> loaded', imageUri)}
                onError={(e) => console.error('[FL Atlas] <img> error', e, imageUri)}
                style={{
                  position: 'absolute',
                  left: 8,
                  top: 8,
                  maxWidth: 96,
                  maxHeight: 96,
                  border: '1px solid var(--vscode-panel-border, gray)',
                  background: 'var(--vscode-editor-background)',
                  imageRendering: 'pixelated',
                }}
              />
            ) : null}
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
