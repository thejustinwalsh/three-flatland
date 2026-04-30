import { mergeActions, useMergeState } from './mergeStore'

export type ToolbarProps = {
  onSave: () => void
  onNamespaceAll: () => void
  deleteOriginals: boolean
  onDeleteOriginalsChange: (next: boolean) => void
}

export function Toolbar(p: ToolbarProps) {
  const state = useMergeState()
  const conflicts =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0
  const nofit = state.result.kind === 'nofit'
  const canSave = state.result.kind === 'ok' && state.sources.length > 0

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: 8,
        borderBottom: '1px solid var(--vscode-panel-border)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <button onClick={p.onNamespaceAll} disabled={state.sources.length === 0}>
        Namespace all
      </button>
      <SettingsPopover />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <input
          type='checkbox'
          checked={p.deleteOriginals}
          onChange={(e) => p.onDeleteOriginalsChange(e.target.checked)}
        />
        Delete originals on success
      </label>
      <div style={{ flex: 1 }} />
      {state.result.kind === 'ok' && state.sources.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)' }}>
          {state.result.atlas.meta.size.w}×{state.result.atlas.meta.size.h} ·{' '}
          {(state.result.utilization * 100).toFixed(0)}% used
        </span>
      )}
      {nofit && (
        <span style={{ color: 'var(--vscode-editorError-foreground)', fontSize: 12 }}>
          Doesn't fit
        </span>
      )}
      {conflicts > 0 && (
        <span style={{ fontSize: 12 }}>Conflicts: {conflicts}</span>
      )}
      <button
        onClick={p.onSave}
        disabled={!canSave}
        title={
          canSave
            ? 'Save'
            : conflicts > 0
            ? 'Resolve conflicts before saving'
            : nofit
            ? "Output doesn't fit; adjust max size or padding"
            : 'Add at least one source to save'
        }
      >
        Pack &amp; Save…
      </button>
    </div>
  )
}

function SettingsPopover() {
  const { knobs } = useMergeState()
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <label>
        Max
        <select
          value={knobs.maxSize}
          onChange={(e) => mergeActions.setKnobs({ maxSize: Number(e.target.value) })}
          style={{ marginLeft: 4 }}
        >
          {[1024, 2048, 4096, 8192].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Pad
        <input
          type='number'
          min={0}
          max={16}
          value={knobs.padding}
          onChange={(e) => mergeActions.setKnobs({ padding: Number(e.target.value) })}
          style={{ width: 48, marginLeft: 4 }}
        />
      </label>
      <label>
        <input
          type='checkbox'
          checked={knobs.powerOfTwo}
          onChange={(e) => mergeActions.setKnobs({ powerOfTwo: e.target.checked })}
        />
        POT
      </label>
    </div>
  )
}
