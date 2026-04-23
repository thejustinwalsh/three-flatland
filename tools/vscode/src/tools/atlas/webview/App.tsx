import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import { Button, Panel, Toolbar, vscodeTokens as t } from '@three-flatland/design-system'
import { SpritePreview } from '@three-flatland/preview'

type InitPayload = { imageUri: string; fileName: string }

declare global {
  interface Window {
    __FL_ATLAS__?: InitPayload
  }
}

export function App() {
  const [payload, setPayload] = useState<InitPayload | null>(() => window.__FL_ATLAS__ ?? null)

  useEffect(() => {
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
      }}
    >
      <Toolbar>
        <strong style={{ fontWeight: 600 }}>FL Sprite Atlas</strong>
        <span style={{ color: t.muted }}>·</span>
        <span style={{ color: t.muted }}>{payload?.fileName ?? 'no file'}</span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" disabled>
          Grid Slice
        </Button>
        <Button variant="secondary" disabled>
          Auto Detect
        </Button>
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
            <SpritePreview imageUri={payload?.imageUri ?? null} />
          </div>
        </Panel>
        <Panel title="Frames">
          <div style={{ color: t.muted, fontSize: t.fontSize }}>
            No frames yet. Slicing tools land in Phase 2.
          </div>
        </Panel>
      </div>
    </div>
  )
}
