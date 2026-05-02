import { useStore } from 'zustand'
import { Toolbar as DSToolbar, ToolbarButton } from '@three-flatland/design-system'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore, encodeHistory } from './encodeStore'

interface SaveResult { ok: boolean; cancelled?: boolean; savedUri?: string }

export function Toolbar() {
  const encodedBytes = useEncodeStore((s) => s.encodedBytes)
  const fileName = useEncodeStore((s) => s.fileName)
  const format = useEncodeStore((s) => s.format)

  const past = useStore(useEncodeStore.temporal, (s) => s.pastStates.length)
  const future = useStore(useEncodeStore.temporal, (s) => s.futureStates.length)

  const onSave = async () => {
    if (!encodedBytes) return
    const base = fileName.replace(/\.[^.]+$/, '')
    const suggestedFilename = `${base}.${format}`
    const bridge = createClientBridge()
    try {
      const result = await bridge.request<SaveResult>('encode/save', {
        format,
        bytes: Array.from(encodedBytes),
        suggestedFilename,
      })
      if (!result?.ok && !result?.cancelled) {
        console.error('encode/save returned not-ok', result)
      }
    } catch (err) {
      console.error('encode/save threw', err)
    }
  }

  return (
    <DSToolbar>
      <ToolbarButton
        icon="discard"
        title="Undo (⌘Z)"
        disabled={past === 0}
        onClick={() => encodeHistory.undo()}
      />
      <ToolbarButton
        icon="redo"
        title="Redo (⌘⇧Z)"
        disabled={future === 0}
        onClick={() => encodeHistory.redo()}
      />
      <ToolbarButton
        icon="save"
        title={encodedBytes ? 'Save…' : 'Encode an image to save'}
        disabled={!encodedBytes}
        onClick={onSave}
      />
    </DSToolbar>
  )
}
