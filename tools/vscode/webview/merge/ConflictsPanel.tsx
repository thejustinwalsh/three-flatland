import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Collapsible, Panel, TextField } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { mergeActions, useMergeState } from './mergeStore'
import type { NameConflict } from '@three-flatland/io/atlas'

const s = stylex.create({
  emptyState: {
    padding: space.lg,
    color: vscode.descriptionFg,
    fontSize: '12px',
  },
  errorState: {
    padding: space.lg,
    color: vscode.errorFg,
    fontSize: '12px',
  },
  body: {
    padding: space.md,
    overflowY: 'auto',
    height: '100%',
  },
  conflictRow: {
    marginBottom: space.md,
    fontSize: '12px',
  },
  conflictName: {
    marginBottom: space.xs,
  },
  renameRow: {
    display: 'flex',
    gap: space.sm,
    alignItems: 'center',
    marginLeft: space.lg,
    marginBottom: space.xs,
  },
  renameAlias: {
    minWidth: 60,
    color: vscode.descriptionFg,
    fontSize: '11px',
  },
  renameField: {
    flex: 1,
  },
})

export function ConflictsPanel() {
  const { result } = useMergeState()

  if (result.kind === 'ok') {
    return (
      <Panel title="Conflicts" bodyPadding="none">
        <div {...stylex.props(s.emptyState)}>No conflicts.</div>
      </Panel>
    )
  }
  if (result.kind === 'nofit') {
    return (
      <Panel title="Conflicts" bodyPadding="none">
        <div {...stylex.props(s.errorState)}>
          Doesn't fit at current max size — try a larger size or reduce padding.
        </div>
      </Panel>
    )
  }
  return (
    <Panel title="Conflicts" bodyPadding="none">
      <div {...stylex.props(s.body)}>
        {result.frameConflicts.length > 0 && (
          <Collapsible title={`Frame conflicts (${result.frameConflicts.length})`} open>
            {result.frameConflicts.map((c) => (
              <ConflictRow key={`f:${c.name}`} conflict={c} kind="frames" />
            ))}
          </Collapsible>
        )}
        {result.animationConflicts.length > 0 && (
          <Collapsible title={`Animation conflicts (${result.animationConflicts.length})`} open>
            {result.animationConflicts.map((c) => (
              <ConflictRow key={`a:${c.name}`} conflict={c} kind="animations" />
            ))}
          </Collapsible>
        )}
      </div>
    </Panel>
  )
}

function ConflictRow(p: { conflict: NameConflict; kind: 'frames' | 'animations' }) {
  return (
    <div {...stylex.props(s.conflictRow)}>
      <div {...stylex.props(s.conflictName)}>
        <code>{p.conflict.name}</code> — {p.conflict.sources.length} sources
      </div>
      {p.conflict.sources.map((s) => (
        <RenameRow
          key={`${s.uri}-${s.originalName}`}
          sourceUri={s.uri}
          alias={s.alias}
          originalName={s.originalName}
          kind={p.kind}
        />
      ))}
    </div>
  )
}

function RenameRow(p: {
  sourceUri: string
  alias: string
  originalName: string
  kind: 'frames' | 'animations'
}) {
  const state = useMergeState()
  const src = state.sources.find((s) => s.uri === p.sourceUri)
  const current = src?.renames[p.kind]?.[p.originalName] ?? p.originalName
  const [draft, setDraft] = useState(current)
  useEffect(() => {
    setDraft(current)
  }, [current])

  const handleChange = (e: Event) => {
    const el = e.currentTarget as HTMLElement & { value: string }
    setDraft(el.value)
  }

  const handleBlur = () => {
    const apply = p.kind === 'frames' ? mergeActions.setFrameRename : mergeActions.setAnimRename
    apply(p.sourceUri, p.originalName, draft === p.originalName ? null : draft)
  }

  return (
    <div {...stylex.props(s.renameRow)}>
      <span {...stylex.props(s.renameAlias)}>{p.alias}</span>
      <div {...stylex.props(s.renameField)}>
        <TextField
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </div>
    </div>
  )
}
