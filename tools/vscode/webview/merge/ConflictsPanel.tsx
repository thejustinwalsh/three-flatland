import { useState } from 'react'
import { mergeActions, useMergeState } from './mergeStore'
import type { NameConflict } from '@three-flatland/io/atlas'

export function ConflictsPanel() {
  const { result } = useMergeState()
  if (result.kind === 'ok') {
    return (
      <div style={{ padding: 12, color: 'var(--vscode-descriptionForeground)' }}>
        No conflicts.
      </div>
    )
  }
  if (result.kind === 'nofit') {
    return (
      <div style={{ padding: 12, color: 'var(--vscode-editorError-foreground)' }}>
        Doesn't fit at current max size — try a larger size or reduce padding.
      </div>
    )
  }
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      {result.frameConflicts.length > 0 && (
        <Section title={`Frame conflicts (${result.frameConflicts.length})`}>
          {result.frameConflicts.map((c) => (
            <ConflictRow key={`f:${c.name}`} conflict={c} kind="frames" />
          ))}
        </Section>
      )}
      {result.animationConflicts.length > 0 && (
        <Section title={`Animation conflicts (${result.animationConflicts.length})`}>
          {result.animationConflicts.map((c) => (
            <ConflictRow key={`a:${c.name}`} conflict={c} kind="animations" />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section(p: { title: string; children: React.ReactNode }) {
  return (
    <details open style={{ marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{p.title}</summary>
      <div style={{ marginTop: 6 }}>{p.children}</div>
    </details>
  )
}

function ConflictRow(p: { conflict: NameConflict; kind: 'frames' | 'animations' }) {
  return (
    <div style={{ marginBottom: 8, fontSize: 12 }}>
      <div style={{ marginBottom: 4 }}>
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
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8, marginBottom: 4 }}>
      <span style={{ minWidth: 60, color: 'var(--vscode-descriptionForeground)' }}>{p.alias}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const apply = p.kind === 'frames' ? mergeActions.setFrameRename : mergeActions.setAnimRename
          apply(p.sourceUri, p.originalName, draft === p.originalName ? null : draft)
        }}
        style={{
          flex: 1,
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          padding: '2px 6px',
          fontSize: 12,
        }}
      />
    </div>
  )
}
