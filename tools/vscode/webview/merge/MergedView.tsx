import { useEffect, useRef, useState } from 'react'
import { mergeActions, useMergeState } from './mergeStore'
import { compositePngBlob } from './composite'

export function MergedView() {
  const state = useMergeState()
  const result = state.result
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (result.kind !== 'ok' || state.sources.length === 0) {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = null
      }
      setImageUrl(null)
      return
    }
    let cancelled = false
    void compositePngBlob(result, state.sources)
      .then((blob) => {
        if (cancelled || !blob) return
        const url = URL.createObjectURL(blob)
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current)
        lastUrlRef.current = url
        setImageUrl(url)
      })
      .catch((err) => {
        console.warn('merge composite failed', err)
        for (const src of state.sources) mergeActions.markImageFailed(src.uri)
      })
    return () => {
      cancelled = true
    }
  }, [result, state.sources])

  if (result.kind === 'conflicts') {
    return (
      <div style={{ padding: 12, color: 'var(--vscode-descriptionForeground)' }}>
        Resolve conflicts to preview the merged atlas.
      </div>
    )
  }
  if (result.kind === 'nofit') {
    return (
      <div style={{ padding: 12, color: 'var(--vscode-editorError-foreground)' }}>
        Doesn't fit at current max size — try a larger size or reduce padding.
      </div>
    )
  }
  if (state.sources.length === 0) {
    return <div style={{ padding: 12 }}>No sources loaded.</div>
  }

  const w = result.atlas.meta.size.w
  const h = result.atlas.meta.size.h
  const animations = result.atlas.meta.animations ?? {}
  const animationCount = Object.keys(animations).length

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12 }}>
        <svg
          width="100%"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMinYMin meet"
          style={{
            display: 'block',
            background: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-panel-border)',
            imageRendering: 'pixelated',
          }}
        >
          {imageUrl && (
            <image
              href={imageUrl}
              x={0}
              y={0}
              width={w}
              height={h}
              preserveAspectRatio="none"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          {Object.entries(result.atlas.frames).map(([name, f]) => (
            <rect
              key={name}
              x={f.frame.x}
              y={f.frame.y}
              width={f.frame.w}
              height={f.frame.h}
              fill="none"
              stroke="var(--vscode-focusBorder)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <aside
        style={{
          width: 280,
          borderLeft: '1px solid var(--vscode-panel-border)',
          padding: 12,
          overflowY: 'auto',
          fontSize: 12,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <strong>Output</strong>: {w}×{h} ·{' '}
          {(result.utilization * 100).toFixed(0)}% used
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>{Object.keys(result.atlas.frames).length}</strong> frames ·{' '}
          <strong>{animationCount}</strong> animations
        </div>
        {animationCount > 0 && (
          <details open>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Animations</summary>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              {Object.entries(animations).map(([name, anim]) => (
                <li key={name} style={{ marginBottom: 2 }}>
                  <code>{name}</code> — {anim.frames.length} frames @ {anim.fps} fps
                  {anim.loop ? '' : ' (no loop)'}
                  {anim.pingPong ? ' (ping-pong)' : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
    </div>
  )
}
