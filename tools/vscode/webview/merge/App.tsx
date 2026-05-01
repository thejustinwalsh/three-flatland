import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { createClientBridge } from '@three-flatland/bridge/client'
import type { AtlasJson } from '@three-flatland/io/atlas'
import { DevReloadToast, Splitter, Tabs, TabHeader, TabPanel } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { compositePngBlob } from './composite'
import { aliasFromUri, namespaceSource } from '@three-flatland/io/atlas'
import { mergeActions, mergeHistory, useMergeState, useMergeStore } from './mergeStore'
import { SourcesView } from './SourcesView'
import { MergedView } from './MergedView'
import { ConflictsPanel } from './ConflictsPanel'
import { Toolbar } from './Toolbar'

type InitPayload = {
  sources: Array<{ uri: string; imageUri: string; alias: string; json: AtlasJson }>
  errors: Array<{ uri: string; message: string }>
}

const s = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    minHeight: 0,
    overflow: 'hidden',
  },
  errorBanner: {
    padding: space.md,
    backgroundColor: vscode.errorBg,
    color: vscode.errorFg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.errorBorder,
    fontSize: '12px',
    flexShrink: 0,
  },
  errorList: {
    margin: '4px 0 0 16px',
    padding: 0,
  },
  tabsWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  // The content area below the tab strip — fills remaining vertical space.
  tabContent: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
  },
  splitRow: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    gap: 0,
    padding: space.sm,
  },
  sourcesMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
  },
  conflictsSidebar: (px: number) => ({
    width: px,
    flexShrink: 0,
    minHeight: 0,
    display: 'flex',
  }),
})

const CONFLICTS_MIN_PX = 240
const CONFLICTS_MAX_PX = 600

export function App() {
  const [initErrors, setInitErrors] = useState<InitPayload['errors']>([])
  const deleteOriginals = useMergeStore((s) => s.deleteOriginals)
  const state = useMergeState()
  const splitRowRef = useRef<HTMLDivElement>(null)
  const conflictsPx = useMergeStore((s) => s.splits.sourcesSidebarPx)
  const activeTab = useMergeStore((s) => s.activeTab)
  const onConflictsDrag = (clientX: number) => {
    const el = splitRowRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = Math.max(CONFLICTS_MIN_PX, Math.min(CONFLICTS_MAX_PX, rect.right - clientX))
    mergeActions.setSplits({ sourcesSidebarPx: next })
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      // Don't intercept when user is typing in an input/textarea.
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        mergeHistory.undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        mergeHistory.redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const bridge = createClientBridge()
    const off = bridge.on<InitPayload>('merge/init', (p) => {
      mergeActions.loadInit(
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

  const handleSave = async () => {
    if (state.result.kind !== 'ok' || state.sources.length === 0) return
    const blob = await compositePngBlob(state.result, state.sources)
    if (!blob) return
    const buf = new Uint8Array(await blob.arrayBuffer())
    const bridge = createClientBridge()
    try {
      await bridge.request('merge/save', {
        pngBytes: Array.from(buf),
        sidecar: state.result.atlas,
        defaultName: state.outputFileName,
        sourcesToDelete: deleteOriginals ? state.sources.map((s) => s.uri) : [],
      })
    } catch (err) {
      console.error('merge/save failed', err)
    }
  }

  const conflictCount =
    state.result.kind === 'conflicts'
      ? state.result.frameConflicts.length + state.result.animationConflicts.length
      : 0

  const sourcesLabel = `Sources${conflictCount > 0 ? ` (${conflictCount})` : ''}`

  return (
    <div {...stylex.props(s.root)}>
      <Toolbar onSave={handleSave} onNamespaceAll={handleNamespaceAll} />
      {initErrors.length > 0 && (
        <div {...stylex.props(s.errorBanner)}>
          {initErrors.length} source(s) failed to load:
          <ul {...stylex.props(s.errorList)}>
            {initErrors.map((e) => (
              <li key={e.uri}>
                <code>{e.uri}</code>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div {...stylex.props(s.tabsWrap)}>
        <Tabs
          selectedIndex={activeTab === 'merged' ? 1 : 0}
          onVscTabsSelect={(e) => {
            mergeActions.setActiveTab(e.detail.selectedIndex === 1 ? 'merged' : 'sources')
          }}
        >
          <TabHeader>{sourcesLabel}</TabHeader>
          <TabHeader>Merged</TabHeader>
          <TabPanel>
            <div ref={splitRowRef} {...stylex.props(s.splitRow)}>
              <div {...stylex.props(s.sourcesMain)}>
                <SourcesView />
              </div>
              <Splitter axis="vertical" onDrag={onConflictsDrag} />
              <div {...stylex.props(s.conflictsSidebar(conflictsPx))}>
                <ConflictsPanel />
              </div>
            </div>
          </TabPanel>
          <TabPanel>
            <MergedView />
          </TabPanel>
        </Tabs>
      </div>
      <DevReloadToast />
    </div>
  )
}
