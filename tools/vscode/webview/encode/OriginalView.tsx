import { useEffect, useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { useEncodeStore } from './encodeStore'

const styles = stylex.create({
  surface: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    display: 'block',
    imageRendering: 'pixelated',
  },
  empty: { padding: 24, opacity: 0.6 },
  fill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
})

export function OriginalView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const sourceBytes = useEncodeStore((s) => s.sourceBytes)
  const fileName = useEncodeStore((s) => s.fileName)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !sourceImage) return
    canvas.width = sourceImage.width
    canvas.height = sourceImage.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(sourceImage, 0, 0)
  }, [sourceImage])

  const sizeKB = sourceBytes ? `${(sourceBytes.length / 1024).toFixed(0)} KB` : '—'
  const dims = sourceImage ? `${sourceImage.width}×${sourceImage.height}` : ''
  const ext = fileName.split('.').pop()?.toUpperCase() ?? ''
  const title = `Original${dims ? ` · ${dims}` : ''}${ext ? ` · ${ext}` : ''} · ${sizeKB}`

  return (
    <Panel title={title} bodyPadding="none" style={styles.fill}>
      {sourceImage ? (
        <div {...stylex.props(styles.surface)}>
          <canvas ref={ref} {...stylex.props(styles.canvas)} />
        </div>
      ) : (
        <div {...stylex.props(styles.empty)}>loading…</div>
      )}
    </Panel>
  )
}
