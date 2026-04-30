import * as stylex from '@stylexjs/stylex'
import {
  Checkbox,
  CompactSelect,
  Divider,
  NumberField,
  Toolbar as DesignToolbar,
  ToolbarButton,
} from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { mergeActions, mergeHistory, useMergeHistoryStore, useMergeState, useMergeStore, CANDIDATE_SIZES } from './mergeStore'

export type ToolbarProps = {
  onSave: () => void
  onNamespaceAll: () => void
}

const s = stylex.create({
  spacer: {
    flex: 1,
  },
  status: {
    fontSize: '11px',
    color: vscode.descriptionFg,
    paddingInline: space.sm,
  },
  statusError: {
    color: vscode.errorFg,
    fontSize: '11px',
    paddingInline: space.sm,
  },
  settingsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
  },
  settingsLabel: {
    fontSize: '11px',
    color: vscode.fg,
    whiteSpace: 'nowrap',
  },
  numberWrap: {
    width: 64,
  },
  selectWrap: {
    width: 80,
  },
  potCheckbox: {
    // Visual separation from the Pad number field — the rest of the
    // settings group uses tight `space.sm` gaps, but POT is a distinct
    // toggle and reads better with breathing room.
    marginInlineStart: space.lg,
  },
  checkboxWrap: {
    display: 'flex',
    alignItems: 'center',
  },
})

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
    <DesignToolbar>
      <ToolbarButton
        icon="discard"
        title="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={() => mergeHistory.undo()}
      />
      <ToolbarButton
        icon="redo"
        title="Redo (⌘⇧Z)"
        disabled={!canRedo}
        onClick={() => mergeHistory.redo()}
      />
      <Divider />
      <ToolbarButton
        icon="symbol-namespace"
        title="Namespace All"
        disabled={state.sources.length === 0}
        onClick={p.onNamespaceAll}
      />
      <Divider />
      <SettingsControls />
      <Divider />
      <div
        {...stylex.props(s.checkboxWrap)}
        title="Delete the original .atlas.json files after the merge saves successfully"
      >
        <Checkbox
          label="Delete sources"
          checked={deleteOriginals}
          onChange={(e) => {
            const el = e.currentTarget as HTMLElement & { checked: boolean }
            mergeActions.setDeleteOriginals(el.checked)
          }}
        />
      </div>
      <div {...stylex.props(s.spacer)} />
      {state.result.kind === 'ok' && state.sources.length > 0 && (
        <span {...stylex.props(s.status)}>
          {state.result.atlas.meta.size.w}×{state.result.atlas.meta.size.h} ·{' '}
          {(state.result.utilization * 100).toFixed(0)}% used
        </span>
      )}
      {nofit && (
        <span {...stylex.props(s.statusError)}>Doesn't fit</span>
      )}
      {conflicts > 0 && (
        <span {...stylex.props(s.status)}>Conflicts: {conflicts}</span>
      )}
      <Divider />
      <ToolbarButton
        icon="save"
        title={
          canSave
            ? 'Pack & Save…'
            : state.imageLoadFailed.size > 0
            ? 'Source image(s) failed to load — fix or remove sources before saving'
            : conflicts > 0
            ? 'Resolve conflicts before saving'
            : nofit
            ? "Output doesn't fit; adjust max size or padding"
            : 'Add at least one source to save'
        }
        disabled={!canSave}
        onClick={p.onSave}
      />
    </DesignToolbar>
  )
}

function SettingsControls() {
  const { knobs, viableSizes, sources, result } = useMergeState()
  // When the merge has unresolvable conflicts, viableSizes is empty
  // because every probe fell into the conflicts branch — show the full
  // candidate list so the user can still pick. Otherwise show only sizes
  // that actually fit. Always include the currently-selected size so
  // the select's value resolves to a real option.
  const showAll = sources.length === 0 || result.kind === 'conflicts'
  const sizeSet = new Set<number>(showAll ? CANDIDATE_SIZES : viableSizes)
  sizeSet.add(knobs.maxSize)
  const sizes = [...sizeSet].sort((a, b) => a - b)

  const sizeOptions = sizes.map((n) => {
    const fits = showAll || viableSizes.includes(n)
    return {
      value: String(n),
      label: fits ? String(n) : `${n} (doesn't fit)`,
    }
  })

  return (
    <div {...stylex.props(s.settingsGroup)}>
      <span {...stylex.props(s.settingsLabel)}>Max</span>
      <div {...stylex.props(s.selectWrap)}>
        <CompactSelect
          value={String(knobs.maxSize)}
          options={sizeOptions}
          onChange={(v) => mergeActions.setKnobs({ maxSize: Number(v) })}
          aria-label="Max texture size"
        />
      </div>
      <span {...stylex.props(s.settingsLabel)}>Pad</span>
      <div {...stylex.props(s.numberWrap)}>
        <NumberField
          value={knobs.padding}
          onChange={(v) => mergeActions.setKnobs({ padding: v })}
          min={0}
          max={16}
          step={1}
          aria-label="Padding"
        />
      </div>
      <div {...stylex.props(s.potCheckbox)} title="Power of Two — round output dimensions to the next power of 2">
        <Checkbox
          label="PoT"
          checked={knobs.powerOfTwo}
          onChange={(e) => {
            const el = e.currentTarget as HTMLElement & { checked: boolean }
            mergeActions.setKnobs({ powerOfTwo: el.checked })
          }}
        />
      </div>
    </div>
  )
}
