import { useEffect } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { decodeImage, type EncodeFormat } from '@three-flatland/image'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore } from './encodeStore'
import { OriginalView } from './OriginalView'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
    gap: space.sm,
  },
  headerLine: {
    padding: space.sm,
  },
  errorBanner: {
    padding: space.sm,
    background: vscode.errorBg,
    color: vscode.errorFg,
    border: `1px solid ${vscode.errorBorder}`,
  },
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
})

type InitPayload = { fileName: string; sourceBytes: number[] | Uint8Array }

function detectFormat(fileName: string): EncodeFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'webp') return 'webp'
  if (ext === 'avif') return 'avif'
  return 'png' // fallback for png and anything we mis-detect
}

export function App() {
  const fileName = useEncodeStore((s) => s.fileName)
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const encodeError = useEncodeStore((s) => s.encodeError)
  const loadInit = useEncodeStore((s) => s.loadInit)
  const setRuntimeFields = useEncodeStore((s) => s.setRuntimeFields)

  useEffect(() => {
    const bridge = createClientBridge()
    const unsubInit = bridge.on<InitPayload>('encode/init', async ({ fileName: fn, sourceBytes }) => {
      try {
        const bytes = sourceBytes instanceof Uint8Array
          ? sourceBytes
          : new Uint8Array(sourceBytes)
        const format = detectFormat(fn)
        const image = await decodeImage(bytes, format)
        loadInit({ fileName: fn, sourceBytes: bytes, sourceImage: image })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setRuntimeFields({ encodeError: `decode failed: ${msg}` })
      }
      return { ok: true }
    })

    bridge.request('encode/ready').catch((err) => {
      console.error('encode/ready request failed', err)
    })

    return () => {
      unsubInit()
    }
  }, [loadInit, setRuntimeFields])

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.headerLine)}>
        FL Image Encoder · <strong>{fileName || '(no file)'}</strong>
        {sourceImage ? ` · ${sourceImage.width}×${sourceImage.height}` : ' · loading…'}
      </div>
      {encodeError && <div {...stylex.props(styles.errorBanner)}>{encodeError}</div>}
      <div {...stylex.props(styles.body)}>
        <OriginalView />
      </div>
    </div>
  )
}
