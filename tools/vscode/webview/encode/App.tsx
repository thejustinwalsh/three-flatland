import { useEffect, useRef } from 'react'
import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { Panel, Splitter } from '@three-flatland/design-system'
import { decodeImage, type EncodeFormat } from '@three-flatland/image'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore } from './encodeStore'
import { scheduleEncode } from './encodePipeline'
import { ComparePreview } from './ComparePreview'
import { Toolbar } from './Toolbar'
import { EncodeMenu } from './EncodeMenu'
import { InfoPanel } from './InfoPanel'

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
  workArea: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'row',
  },
  comparePanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  infoPanel: {
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
  },
})

type InitPayload = {
  fileName: string
  sourceBytes: number[] | Uint8Array
  mode: 'encode' | 'inspect'
}

function detectFormat(fileName: string): EncodeFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'webp') return 'webp'
  if (ext === 'avif') return 'avif'
  if (ext === 'ktx2') return 'ktx2'
  return 'png' // fallback for png and anything we mis-detect
}

export function App() {
  const encodeError = useEncodeStore((s) => s.encodeError)
  const loadInit = useEncodeStore((s) => s.loadInit)
  const setRuntimeFields = useEncodeStore((s) => s.setRuntimeFields)
  const mode = useEncodeStore((s) => s.mode)
  const infoPanelWidth = useEncodeStore((s) => s.splits.infoPanelWidth)
  const setInfoPanelWidth = useEncodeStore((s) => s.setInfoPanelWidth)
  const workAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bridge = createClientBridge()
    const unsubInit = bridge.on<InitPayload>('encode/init', async ({ fileName: fn, sourceBytes, mode }) => {
      try {
        const bytes = sourceBytes instanceof Uint8Array
          ? sourceBytes
          : new Uint8Array(sourceBytes)

        if (mode === 'inspect') {
          // The source IS the encoded artifact. Skip the decode-then-encode
          // pipeline. Store encodedBytes = sourceBytes AND encodedFormat so
          // the texture hook picks the right decoder (KTX2Loader for ktx2,
          // decodeImage otherwise). The compare slider is hidden (no
          // original to compare against) — ComparePreview uses the same
          // texture on both sides with splitU=1 so mip stepping still works.
          setRuntimeFields({
            encodedBytes: bytes,
            encodedFormat: detectFormat(fn),
            isEncoding: false,
          })
          const ext = fn.split('.').pop()?.toLowerCase() ?? ''
          if (ext === 'webp' || ext === 'avif') {
            // Produce a source ImageData so the left/original side isn't empty
            // (moot with slider hidden but prevents a stale loading state).
            const format = detectFormat(fn)
            const image = await decodeImage(bytes, format)
            loadInit({ fileName: fn, sourceBytes: bytes, sourceImage: image, mode })
          } else {
            // KTX2: no JS-side ImageData decode. sourceImage = null;
            // ComparePreview handles null source in inspect mode by using the
            // encoded texture on both sides (see inspect-mode render path).
            loadInit({ fileName: fn, sourceBytes: bytes, sourceImage: null, mode })
          }
        } else {
          // Encode mode: decode source PNG for the original side; encode
          // pipeline fires via the store subscription below.
          const format = detectFormat(fn)
          const image = await decodeImage(bytes, format)
          loadInit({ fileName: fn, sourceBytes: bytes, sourceImage: image, mode })
        }
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
    // the slice is small. Skip entirely in inspect mode — no encode pipeline.
    // Watch the doc-knob slice + sourceImage identity. The subscription
    // fires on EVERY store change (including splitU during slider drags
    // and mipLevel during stepper clicks); we MUST keep the equality check
    // O(1) — never JSON.stringify the ImageData (it's a 2048²·4 byte
    // Uint8ClampedArray for our worst-case fixture, which serializes to
    // ~160 MB per pointermove and OOMs the webview within a few seconds
    // of slider drag).
    let prevKey = ''
    let prevSourceImage: ImageData | null = null
    const unsub = useEncodeStore.subscribe((s) => {
      if (s.mode === 'inspect') return
      if (!s.sourceImage) return
      const sourceChanged = s.sourceImage !== prevSourceImage
      prevSourceImage = s.sourceImage
      const key = JSON.stringify({
        f: s.format,
        w: s.webp.quality,
        a: s.avif.quality,
        k: { m: s.ktx2.mode, q: s.ktx2.quality, mp: s.ktx2.mipmaps, l: s.ktx2.uastcLevel },
      })
      if (!sourceChanged && key === prevKey) return
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
      <Toolbar />
      {encodeError && <div {...stylex.props(styles.errorBanner)}>{encodeError}</div>}
      <div ref={workAreaRef} {...stylex.props(styles.workArea)}>
        <Panel
          title="Compare"
          bodyPadding="none"
          headerActions={<EncodeMenu />}
          style={styles.comparePanel}
        >
          <ComparePreview />
        </Panel>
        {mode === 'encode' && (
          <>
            <Splitter
              axis="vertical"
              onDrag={(clientX) => {
                const el = workAreaRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                // Sidebar width = distance from cursor to right edge.
                // setInfoPanelWidth clamps to 240–480 inside the store.
                setInfoPanelWidth(rect.right - clientX)
              }}
            />
            <Panel
              title="Info"
              bodyPadding="none"
              style={styles.infoPanel}
            >
              <div style={{ width: infoPanelWidth, height: '100%' }}>
                <InfoPanel />
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  )
}
