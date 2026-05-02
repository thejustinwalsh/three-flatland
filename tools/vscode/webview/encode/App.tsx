import { useEffect } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { Panel } from '@three-flatland/design-system'
import { decodeImage, type EncodeFormat } from '@three-flatland/image'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore } from './encodeStore'
import { scheduleEncode } from './encodePipeline'
import { ComparePreview } from './ComparePreview'
import { Knobs } from './Knobs'
import { Toolbar } from './Toolbar'
import { EncodeMenu } from './EncodeMenu'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
  },
  errorBanner: {
    padding: space.sm,
    background: vscode.errorBg,
    color: vscode.errorFg,
    border: `1px solid ${vscode.errorBorder}`,
  },
  panelFill: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  headerActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
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

  useEffect(() => {
    // Encode whenever sourceImage flips to non-null OR a knob changes.
    // We compare a stringified summary to avoid a custom equality function;
    // the slice is small.
    let prevKey = ''
    const unsub = useEncodeStore.subscribe((s) => {
      if (!s.sourceImage) return
      const key = JSON.stringify({
        f: s.format,
        w: s.webp.quality,
        a: s.avif.quality,
        k: { m: s.ktx2.mode, q: s.ktx2.quality, mp: s.ktx2.mipmaps, l: s.ktx2.uastcLevel },
        // include sourceImage identity so we re-encode on a fresh source
        img: s.sourceImage,
      })
      if (key === prevKey) return
      prevKey = key
      scheduleEncode(250)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const cmdOrCtrl = e.metaKey || e.ctrlKey
      if (!cmdOrCtrl) return
      if (e.key === 'z' && !e.shiftKey) {
        useEncodeStore.temporal.getState().undo()
        e.preventDefault()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'Z') {
        useEncodeStore.temporal.getState().redo()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div {...stylex.props(styles.root)}>
      {encodeError && <div {...stylex.props(styles.errorBanner)}>{encodeError}</div>}
      <Panel
        title="Compare"
        bodyPadding="none"
        headerActions={
          <div {...stylex.props(styles.headerActions)}>
            <Knobs />
            <Toolbar />
            <EncodeMenu />
          </div>
        }
        style={styles.panelFill}
      >
        <ComparePreview />
      </Panel>
    </div>
  )
}
