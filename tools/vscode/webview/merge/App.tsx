import { useEffect, useState } from 'react'
import { createClientBridge } from '@three-flatland/bridge/client'
import type { AtlasJson } from '@three-flatland/io/atlas'
import { aliasFromUri, namespaceSource } from '@three-flatland/io/atlas'
import { mergeActions, useMergeState } from './mergeStore'
import { SourcesView } from './SourcesView'
import { MergedView } from './MergedView'
import { ConflictsPanel } from './ConflictsPanel'
import { Toolbar } from './Toolbar'

type Tab = 'sources' | 'merged'

type InitPayload = {
  sources: Array<{ uri: string; imageUri: string; alias: string; json: AtlasJson }>
  errors: Array<{ uri: string; message: string }>
}

export function App() {
  const [tab, setTab] = useState<Tab>('sources')
  const [initErrors, setInitErrors] = useState<InitPayload['errors']>([])
  const [deleteOriginals, setDeleteOriginals] = useState(false)
  const state = useMergeState()
  useEffect(() => {
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('merge/init', (p) => {
      mergeActions.setSources(
        p.sources.map((s) => ({
          uri: s.uri,
          imageUri: s.imageUri,
          alias: s.alias || aliasFromUri(s.uri),
          json: s.json,
          renames: {},
        }))
      )
      setInitErrors(p.errors)
    })
    void bridge.request('merge/ready')
    return () => off()
  }, [])

  const handleNamespaceAll = () => {
    for (const src of state.sources) {
      const { frames, animations } = namespaceSource({ json: src.json, alias: src.alias })
      for (const [orig, merged] of Object.entries(frames)) {
        mergeActions.setFrameRename(src.uri, orig, merged)
      }
      for (const [orig, merged] of Object.entries(animations)) {
        mergeActions.setAnimRename(src.uri, orig, merged)
      }
    }
  }

  const handleSave = () => {
    // T15 wires this to the actual save flow.
  }

  const conflictCount =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {initErrors.length > 0 && (
        <div
          style={{
            padding: 8,
            background: 'var(--vscode-inputValidation-errorBackground)',
            color: 'var(--vscode-inputValidation-errorForeground)',
            borderBottom: '1px solid var(--vscode-inputValidation-errorBorder)',
            fontSize: 12,
          }}
        >
          {initErrors.length} source(s) failed to load:
          <ul style={{ margin: '4px 0 0 16px' }}>
            {initErrors.map((e) => (
              <li key={e.uri}>
                <code>{e.uri}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Toolbar
        onSave={handleSave}
        onNamespaceAll={handleNamespaceAll}
        deleteOriginals={deleteOriginals}
        onDeleteOriginalsChange={setDeleteOriginals}
      />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)' }}>
        <TabButton
          active={tab === 'sources'}
          onClick={() => setTab('sources')}
          label={`Sources${conflictCount > 0 ? ` (${conflictCount})` : ''}`}
        />
        <TabButton active={tab === 'merged'} onClick={() => setTab('merged')} label="Merged" />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'sources' ? (
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SourcesView />
            </div>
            <div
              style={{
                width: 320,
                borderLeft: '1px solid var(--vscode-panel-border)',
                overflow: 'hidden',
              }}
            >
              <ConflictsPanel />
            </div>
          </div>
        ) : (
          <MergedView />
        )}
      </div>
    </div>
  )
}

function TabButton(p: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={p.onClick}
      style={{
        background: p.active ? 'var(--vscode-tab-activeBackground)' : 'transparent',
        color: 'var(--vscode-tab-activeForeground)',
        border: 'none',
        borderBottom: p.active
          ? '2px solid var(--vscode-focusBorder)'
          : '2px solid transparent',
        padding: '8px 14px',
        cursor: 'pointer',
      }}
    >
      {p.label}
    </button>
  )
}
