import { useEffect, useRef, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import {
  Toolbar,
  ToolbarButton,
  Divider,
  Panel,
  Splitter,
  DevReloadToast,
} from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { useZzfxSession } from './useZzfxSession'
import { ParamGroup } from './ParamGroup'
import { PillGroup } from './PillGroup'
import { AiGeneratePanel } from './AiGeneratePanel'
import { useSidebarWidth } from './useSidebarWidth'
import { playParams } from './audio'
import {
  CATEGORIES,
  fromArgs,
  MAX_STYLES,
  PARAM_GROUPS,
  STYLES,
  type Category,
  type Style,
} from './params'

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: vscode.bg,
    color: vscode.fg,
  },
  banner: {
    padding: space.sm,
    fontSize: '11px',
  },
  infoBanner: {
    backgroundColor: vscode.panelBg,
    color: vscode.descriptionFg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
  },
  errorBanner: {
    backgroundColor: vscode.errorBg,
    color: vscode.errorFg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.errorBorder,
  },
  spacer: {
    flex: 1,
  },
  // Params (main) | Splitter | Category+Style+Generate (sidebar) — the
  // same shell shape atlas/merge use (Toolbar header, resizable side
  // column), so params are always visible without collapsing anything,
  // and the category/style/generate workflow reads as one group instead
  // of being stacked in-line with — and pushed off-screen by — the
  // param list.
  workArea: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    padding: space.lg,
    gap: 0,
  },
  paramsPanel: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  paramsBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
  },
  sidebar: (px: number) => ({
    width: px,
    flexShrink: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  }),
})

export function App() {
  const session = useZzfxSession()
  const [playError, setPlayError] = useState<string | null>(null)
  const [sidebarPx, setSidebarPx] = useSidebarWidth()
  const workAreaRef = useRef<HTMLDivElement>(null)

  const handlePlay = () => {
    setPlayError(null)
    playParams(session.params).catch((err) => {
      setPlayError(err instanceof Error ? err.message : String(err))
    })
  }

  // CodeLens ▶ Play / playAtCursor route (#148 Z3) — host.ts opens/reuses
  // this panel and pushes `zzfx/play`, independent of whatever finding is
  // loaded here. Reuses the exact same playback + error path as the
  // toolbar button above. If the panel was just opened programmatically
  // (not from a click inside this webview's own document), the browser's
  // autoplay policy may block AudioContext.resume() until a real user
  // gesture happens INSIDE this document — that failure surfaces through
  // the same `playError` banner, worded to point at the toolbar ▶ Play
  // button as the fallback, rather than silently pretending it played.
  useEffect(() => {
    if (!session.playRequest) return
    setPlayError(null)
    playParams(fromArgs(session.playRequest.params)).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      setPlayError(`${message} — click ▶ Play above to enable audio in this panel first.`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.playRequest])

  const subtitle = session.varRefName
    ? `Editing "${session.varRefName}"`
    : session.uri
      ? 'Editing an inline zzfx() call'
      : null

  return (
    <div {...stylex.props(styles.root)}>
      <Toolbar>
        <ToolbarButton icon="play" title="Play" onClick={handlePlay} />
        <Divider />
        <ToolbarButton
          icon="save"
          title={
            session.standalone
              ? 'Save disabled — no host connection'
              : session.loadError
                ? "Save disabled — this declaration couldn't be read"
                : session.dirty
                  ? 'Save (unsaved changes)'
                  : 'Save'
          }
          disabled={
            session.standalone || session.saving || !session.findingId || Boolean(session.loadError)
          }
          onClick={() => void session.save()}
        />
        <div {...stylex.props(styles.spacer)} />
        {subtitle && (
          <span {...stylex.props(styles.banner)}>
            {subtitle}
            {session.dirty ? ' •' : ''}
          </span>
        )}
      </Toolbar>

      {session.standalone && (
        <div {...stylex.props(styles.banner, styles.infoBanner)}>
          Standalone mode — not connected to a host. Play works with default params; Save is
          disabled.
        </div>
      )}
      {session.loadError && (
        <div {...stylex.props(styles.banner, styles.errorBanner)}>
          {session.loadError} Showing defaults — Save is disabled until the source is fixed.
        </div>
      )}
      {playError && (
        <div {...stylex.props(styles.banner, styles.errorBanner)}>Play failed: {playError}</div>
      )}
      {session.saveError && (
        <div {...stylex.props(styles.banner, styles.errorBanner)}>
          Save failed: {session.saveError}
        </div>
      )}

      <div ref={workAreaRef} {...stylex.props(styles.workArea)}>
        <Panel title="Parameters" bodyPadding="normal" style={styles.paramsPanel}>
          <div {...stylex.props(styles.paramsBody)}>
            {PARAM_GROUPS.map((g) => (
              <ParamGroup
                key={g.key}
                groupKey={g.key}
                params={session.params}
                onChangeParam={session.setParam}
              />
            ))}
          </div>
        </Panel>

        <Splitter
          axis="vertical"
          onDrag={(clientX) => {
            const el = workAreaRef.current
            if (!el) return
            // Sidebar width = distance from the cursor to the work
            // area's right edge — same convention as atlas's Frames
            // splitter. Clamping to [SIDEBAR_MIN_PX, SIDEBAR_MAX_PX]
            // happens inside the hook.
            const rect = el.getBoundingClientRect()
            setSidebarPx(rect.right - clientX)
          }}
        />

        <div {...stylex.props(styles.sidebar(sidebarPx))}>
          {/* bodyOverflow="visible": these two panels wrap a single
              short pill row sized by their own content, not stretched
              to fill the sidebar — see the prop's doc comment in
              design-system's Panel.tsx for why the 'auto' default
              silently collapses an un-stretched body to ~0px. */}
          <Panel title="Category" bodyPadding="normal" bodyOverflow="visible">
            <PillGroup<Category>
              options={CATEGORIES}
              selected={session.category ? [session.category as Category] : []}
              onChange={(next) => session.setCategory(next[0] ?? null)}
              aria-label="Sound category"
            />
          </Panel>

          <Panel title={`Style (max ${MAX_STYLES})`} bodyPadding="normal" bodyOverflow="visible">
            <PillGroup<Style>
              options={STYLES}
              selected={session.styles as Style[]}
              onChange={(next) => session.setStyles(next)}
              multiple
              max={MAX_STYLES}
              aria-label={`Sound style, up to ${MAX_STYLES}`}
            />
          </Panel>

          <AiGeneratePanel
            standalone={session.standalone}
            lmAvailable={session.lmAvailable}
            category={session.category}
            presets={session.presets}
            generating={session.generating}
            generateError={session.generateError}
            generateStream={session.generateStream}
            candidates={session.candidates}
            lastGenerateSource={session.lastGenerateSource}
            onGenerate={() => void session.generate()}
            onApplyCandidate={session.applyCandidate}
          />
        </div>
      </div>

      <DevReloadToast />
    </div>
  )
}
