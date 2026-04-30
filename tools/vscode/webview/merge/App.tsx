import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'

export function App() {
  const [sources, setSources] = useState<{ uri: string }[]>([])
  useEffect(() => {
    const bridge = createClientBridge()
    const off = bridge.on<{ sources: { uri: string }[] }>('merge/init', (params) => {
      setSources(params.sources)
    })
    void bridge.request('merge/ready')
    return () => off()
  }, [])
  return (
    <div style={{ padding: 16 }}>
      <h2>FL Atlas Merge</h2>
      <p>Sources:</p>
      <ul>
        {sources.map((s) => (
          <li key={s.uri}>{s.uri}</li>
        ))}
      </ul>
    </div>
  )
}
