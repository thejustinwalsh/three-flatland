import { useStore } from 'zustand'
import { Toolbar as DSToolbar, ToolbarButton, Divider } from '@three-flatland/design-system'
import { createClientBridge } from '@three-flatland/bridge/client'
import { useEncodeStore, encodeHistory, encodeActions } from './encodeStore'
import { Knobs } from './Knobs'

interface SaveResult { ok: boolean; cancelled?: boolean; savedUri?: string }

export function Toolbar() {
  const encodedBytes = useEncodeStore((s) => s.encodedBytes)
  const fileName = useEncodeStore((s) => s.fileName)
  const format = useEncodeStore((s) => s.format)
  const mipLevel = useEncodeStore((s) => s.mipLevel)
  const encodedMipCount = useEncodeStore((s) => s.encodedMipCount)
  const mode = useEncodeStore((s) => s.mode)

  const past = useStore(useEncodeStore.temporal, (s) => s.pastStates.length)
  const future = useStore(useEncodeStore.temporal, (s) => s.futureStates.length)

  const hasMips = encodedMipCount > 1
  const decMip = () => encodeActions.setMipLevel(mipLevel - 1)
  const incMip = () => encodeActions.setMipLevel(mipLevel + 1)

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
      {/* Format / quality knobs — fragment children */}
      <Knobs />
      <Divider />
      {/* Mip stepper */}
      <ToolbarButton
        icon="chevron-left"
        title="Previous mip level"
        disabled={!hasMips || mipLevel <= 0}
        onClick={decMip}
      />
      <span style={{ minWidth: 80, textAlign: 'center', fontSize: 12, opacity: hasMips ? 1 : 0.4 }}>
        {hasMips ? `Mip ${mipLevel} / ${encodedMipCount - 1}` : 'Mip — / —'}
      </span>
      <ToolbarButton
        icon="chevron-right"
        title="Next mip level"
        disabled={!hasMips || mipLevel >= encodedMipCount - 1}
        onClick={incMip}
      />
      <Divider />
      {/* Edit + persist actions */}
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
      <Divider />
      <ToolbarButton
        icon="save"
        title={mode === 'inspect' ? 'Save disabled in inspect mode' : encodedBytes ? 'Save…' : 'Encode an image to save'}
        disabled={!encodedBytes || mode === 'inspect'}
        onClick={onSave}
      />
    </DSToolbar>
  )
}
