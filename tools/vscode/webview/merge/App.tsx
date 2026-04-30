import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'

type Source = { uri: string; imageUri: string; alias: string; json: unknown }
type InitPayload = {
  sources: Source[]
  errors: Array<{ uri: string; message: string }>
}

export function App() {
  const [sources, setSources] = useState<Source[]>([])
  const [errors, setErrors] = useState<InitPayload['errors']>([])
  useEffect(() => {
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('merge/init', (params) => {
      setSources(params.sources)
      setErrors(params.errors)
      if (params.errors.length > 0) {
        console.warn('merge/init errors:', params.errors)
      }
    })
    void bridge.request('merge/ready')
    return () => off()
  }, [])
  return (
    <div style={{ padding: 16 }}>
      <h2>FL Atlas Merge</h2>
      {errors.length > 0 && (
        <div style={{ color: 'var(--vscode-editorError-foreground)', marginBottom: 12 }}>
          {errors.length} source(s) failed to load:
          <ul>
            {errors.map((e) => (
              <li key={e.uri}>
                <code>{e.uri}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>Sources:</p>
      <ul>
        {sources.map((s) => (
          <li key={s.uri}>
            {s.alias} — {Object.keys((s.json as { frames?: Record<string, unknown> }).frames ?? {}).length} frames
          </li>
        ))}
      </ul>
    </div>
  )
}
