import { useEffect, useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Panel } from '@three-flatland/design-system'
import { useEncodeStore } from './encodeStore'

const styles = stylex.create({
  fill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  surface: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  canvas: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    display: 'block',
    imageRendering: 'pixelated',
  },
  overlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    background: 'rgba(0,0,0,0.5)',
    color: 'white',
    padding: '4px 8px',
    fontSize: 11,
    borderRadius: 4,
    pointerEvents: 'none',
  },
  empty: {
    padding: 24,
    fontSize: 13,
    opacity: 0.7,
    textAlign: 'center',
    maxWidth: 320,
  },
})

export function EncodedView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const encodedImage = useEncodeStore((s) => s.encodedImage)
  const encodedSize = useEncodeStore((s) => s.encodedSize)
  const sourceBytes = useEncodeStore((s) => s.sourceBytes)
  const isEncoding = useEncodeStore((s) => s.isEncoding)
  const format = useEncodeStore((s) => s.format)
  const encodeError = useEncodeStore((s) => s.encodeError)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !encodedImage) return
    canvas.width = encodedImage.width
    canvas.height = encodedImage.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.putImageData(encodedImage, 0, 0)
  }, [encodedImage])

  const ratio = encodedSize > 0 && sourceBytes ? `${(sourceBytes.length / encodedSize).toFixed(1)}×` : ''
  const sizeKB = encodedSize > 0 ? `${(encodedSize / 1024).toFixed(0)} KB` : '—'
  const title = `Encoded · ${format.toUpperCase()} · ${sizeKB}${ratio ? ` · ${ratio}` : ''}`

  const body = encodedImage ? (
    <div {...stylex.props(styles.surface)}>
      <canvas ref={ref} {...stylex.props(styles.canvas)} />
      {isEncoding && <div {...stylex.props(styles.overlay)}>encoding…</div>}
    </div>
  ) : encodedSize > 0 && format === 'ktx2' ? (
    <div {...stylex.props(styles.surface)}>
      <div {...stylex.props(styles.empty)}>
        KTX2 preview unavailable — decode is provided by three.js KTX2Loader at runtime.
        The encoded file is ready to save.
      </div>
      {isEncoding && <div {...stylex.props(styles.overlay)}>encoding…</div>}
    </div>
  ) : (
    <div {...stylex.props(styles.surface)}>
      <div {...stylex.props(styles.empty)}>
        {isEncoding ? 'encoding…' : encodeError ? `error: ${encodeError}` : '(encode pending)'}
      </div>
    </div>
  )

  return (
    <Panel title={title} bodyPadding="none" style={styles.fill}>
      {body}
    </Panel>
  )
}
