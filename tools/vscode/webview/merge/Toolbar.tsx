import { mergeActions, mergeHistory, useMergeHistoryStore, useMergeState, useMergeStore, CANDIDATE_SIZES } from './mergeStore'

export type ToolbarProps = {
  onSave: () => void
  onNamespaceAll: () => void
}

export function Toolbar(p: ToolbarProps) {
  const state = useMergeState()
  const deleteOriginals = useMergeStore((s) => s.deleteOriginals)
  const history = useMergeHistoryStore()
  const canUndo = history.pastStates.length > 0
  const canRedo = history.futureStates.length > 0
  const conflicts =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0
  const nofit = state.result.kind === 'nofit'
  const canSave = state.result.kind === 'ok' && state.sources.length > 0 && state.imageLoadFailed.size === 0

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
      <button
        onClick={() => mergeHistory.undo()}
        disabled={!canUndo}
        title='Undo (Cmd/Ctrl+Z)'
        aria-label='Undo'
      >
        ↩
      </button>
      <button
        onClick={() => mergeHistory.redo()}
        disabled={!canRedo}
        title='Redo (Cmd/Ctrl+Shift+Z)'
        aria-label='Redo'
      >
        ↪
      </button>
      <button onClick={p.onNamespaceAll} disabled={state.sources.length === 0}>
        Namespace all
      </button>
      <SettingsPopover />
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
        <input
          type='checkbox'
          checked={deleteOriginals}
          onChange={(e) => mergeActions.setDeleteOriginals(e.target.checked)}
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
            : state.imageLoadFailed.size > 0
            ? 'Source image(s) failed to load — fix or remove sources before saving'
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
  const { knobs, viableSizes, sources, result } = useMergeState()
  // When the merge has unresolvable conflicts, viableSizes is empty
  // because every probe fell into the conflicts branch — show the full
  // candidate list so the user can still pick. Otherwise show only sizes
  // that actually fit. Always include the currently-selected size so
  // the <select>'s value resolves to a real <option>.
  const showAll = sources.length === 0 || result.kind === 'conflicts'
  const sizeSet = new Set<number>(showAll ? CANDIDATE_SIZES : viableSizes)
  sizeSet.add(knobs.maxSize)
  const sizes = [...sizeSet].sort((a, b) => a - b)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <label>
        Max
        <select
          value={knobs.maxSize}
          onChange={(e) => mergeActions.setKnobs({ maxSize: Number(e.target.value) })}
          style={{ marginLeft: 4 }}
        >
          {sizes.map((n) => {
            const fits = showAll || viableSizes.includes(n)
            return (
              <option key={n} value={n}>
                {n}
                {fits ? '' : " (doesn't fit)"}
              </option>
            )
          })}
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
