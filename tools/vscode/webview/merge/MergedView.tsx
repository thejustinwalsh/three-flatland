import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Collapsible, Panel, Splitter } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { mergeActions, useMergeState } from './mergeStore'
import { compositePngBlob } from './composite'

const s = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    minHeight: 0,
    padding: space.sm,
  },
  outputPanel: {
    flex: 1,
    minWidth: 0,
  },
  canvasWrap: {
    flex: 1,
    minWidth: 0,
    overflow: 'auto',
    padding: space.md,
  },
  svg: {
    display: 'block',
    imageRendering: 'pixelated',
  },
  emptyState: {
    padding: space.lg,
    color: vscode.descriptionFg,
    fontSize: '12px',
  },
  errorState: {
    padding: space.lg,
    color: vscode.errorFg,
    fontSize: '12px',
  },
  statsBlock: {
    marginBottom: space.sm,
    fontSize: '12px',
  },
  sidePanel: (px: number) => ({
    width: px,
    flexShrink: 0,
  }),
  sideBody: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
  },
  sideStats: {
    paddingBlock: space.lg,
    paddingInline: space.lg,
    flexShrink: 0,
  },
  sideAccordion: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  animList: {
    margin: 0,
    padding: 0,
    paddingInlineStart: space.xxxl,
    paddingBlock: space.sm,
    listStyle: 'disc',
    fontSize: '12px',
    overflow: 'auto',
    minHeight: 0,
  },
  animItem: {
    marginBottom: space.xs,
  },
})

const ANIMS_MIN_PX = 220
const ANIMS_MAX_PX = 500
const ANIMS_DEFAULT_PX = 280

export function MergedView() {
  const state = useMergeState()
  const result = state.result
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [animsPx, setAnimsPx] = useState(ANIMS_DEFAULT_PX)
  const onAnimsDrag = (clientX: number) => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = Math.max(ANIMS_MIN_PX, Math.min(ANIMS_MAX_PX, rect.right - clientX))
    setAnimsPx(next)
  }

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
      <div {...stylex.props(s.emptyState)}>
        Resolve conflicts to preview the merged atlas.
      </div>
    )
  }
  if (result.kind === 'nofit') {
    return (
      <div {...stylex.props(s.errorState)}>
        Doesn't fit at current max size — try a larger size or reduce padding.
      </div>
    )
  }
  if (state.sources.length === 0) {
    return <div {...stylex.props(s.emptyState)}>No sources loaded.</div>
  }

  const w = result.atlas.meta.size.w
  const h = result.atlas.meta.size.h
  const animations = result.atlas.meta.animations ?? {}
  const animationCount = Object.keys(animations).length

  return (
    <div ref={rootRef} {...stylex.props(s.root)}>
      <Panel title="Output" bodyPadding="none" style={s.outputPanel}>
        <div {...stylex.props(s.canvasWrap)}>
          <svg
            width="100%"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="xMinYMin meet"
            {...stylex.props(s.svg)}
            style={{
              background: 'var(--vscode-editor-background)',
              border: '1px solid var(--vscode-panel-border)',
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
      </Panel>
      <Splitter axis="vertical" onDrag={onAnimsDrag} />
      <Panel title="Animations" style={s.sidePanel(animsPx)} bodyPadding="none">
        <div {...stylex.props(s.sideBody)}>
          <div {...stylex.props(s.sideStats)}>
            <div {...stylex.props(s.statsBlock)}>
              <strong>Output</strong>: {w}×{h} · {(result.utilization * 100).toFixed(0)}% used
            </div>
            <div {...stylex.props(s.statsBlock)}>
              <strong>{Object.keys(result.atlas.frames).length}</strong> frames ·{' '}
              <strong>{animationCount}</strong> animations
            </div>
          </div>
          {animationCount > 0 && (
            <div {...stylex.props(s.sideAccordion)}>
              <Collapsible title="Animations" open>
                <ul {...stylex.props(s.animList)}>
                  {Object.entries(animations).map(([name, anim]) => (
                    <li key={name} {...stylex.props(s.animItem)}>
                      <code>{name}</code> — {anim.frames.length} frames @ {anim.fps} fps
                      {anim.loop ? '' : ' (no loop)'}
                      {anim.pingPong ? ' (ping-pong)' : ''}
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
