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
import { SourceLink } from './SourceLink'
import { useSidebarWidth } from './useSidebarWidth'
import { WaveformPreview } from './WaveformPreview'
import { playParams, type PlaybackHandle } from './audio'
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
  // Right toolbar slot: unsaved-changes dot + source-location link.
  headerMeta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    paddingInline: space.sm,
  },
  dirtyDot: {
    color: vscode.descriptionFg,
    fontSize: '11px',
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
  // Waveform strip stacked above the params panel — same `space.sm`
  // rhythm the sidebar uses between its panels.
  mainColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
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
    // Belt-and-suspenders against the params panel's own 200px floor:
    // a persisted-wide sidebar (from a wider window last session)
    // could otherwise crush it in a narrower split-editor width.
    maxWidth: 'calc(100% - 204px)',
    flexShrink: 0,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  }),
})

export function App() {
  const session = useZzfxSession()
  const [playError, setPlayError] = useState<string | null>(null)
  const [playback, setPlayback] = useState<PlaybackHandle | null>(null)
  const [sidebarPx, setSidebarPx] = useSidebarWidth()
  const workAreaRef = useRef<HTMLDivElement>(null)

  const handlePlay = () => {
    setPlayError(null)
    playParams(session.params).then(
      // Feeds the waveform's playhead sweep — only this toolbar route, so
      // the sweep always tracks the params the trace was drawn from.
      (handle) => setPlayback(handle),
      (err: unknown) => {
        setPlayError(err instanceof Error ? err.message : String(err))
      }
    )
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

  // Header source link — "the variable name when possible, or the file
  // and line number" (the panel tab already carries the call-site
  // file:line, so the variable case must not duplicate it):
  //   variable w/ readable declaration → label `LASER`, tooltip the
  //     DECLARATION's `path:line` (1-based) — clicking reveals what Save
  //     writes to;
  //   literal call (or unreadable declaration) → label `basename:line+1`
  //     of the call site, tooltip the full workspace-relative path.
  // Null in standalone mode (no init payload), leaving the slot empty.
  const sourceLabel =
    session.varRefName !== null && session.def !== null
      ? session.varRefName
      : session.sourcePath !== null && session.sourceLine !== null
        ? `${session.sourcePath.split(/[\\/]/).pop() ?? session.sourcePath}:${session.sourceLine + 1}`
        : null
  const sourceTitle = session.def
    ? `${session.def.path}:${session.def.line + 1}`
    : session.sourcePath

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
        {sourceLabel && sourceTitle && (
          <span {...stylex.props(styles.headerMeta)}>
            {session.dirty && (
              <span {...stylex.props(styles.dirtyDot)} title="Unsaved changes">
                •
              </span>
            )}
            <SourceLink label={sourceLabel} title={sourceTitle} onReveal={session.revealSource} />
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
        <div {...stylex.props(styles.mainColumn)}>
          <WaveformPreview params={session.params} playback={playback} />
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
        </div>

        <Splitter
          axis="vertical"
          onDrag={(clientX) => {
            const el = workAreaRef.current
            if (!el) return
            // Sidebar width = distance from the cursor to the work
            // area's right edge — same convention as atlas's Frames
            // splitter. [SIDEBAR_MIN_PX, SIDEBAR_MAX_PX] clamping
            // happens inside the hook; the extra `rect.width - 204`
            // term here is container-aware on top of that, so a wide
            // sidebar can't crush the params panel below its own
            // 200px floor (+ the splitter's 4px) in a narrow window.
            const rect = el.getBoundingClientRect()
            setSidebarPx(Math.min(rect.right - clientX, rect.width - 204))
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
