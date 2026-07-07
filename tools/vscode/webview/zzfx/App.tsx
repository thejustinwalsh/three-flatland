import { useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import {
  Toolbar,
  ToolbarButton,
  Divider,
  Panel,
  DevReloadToast,
} from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { useZzfxSession } from './useZzfxSession'
import { ParamGroup } from './ParamGroup'
import { PillGroup } from './PillGroup'
import { AiGeneratePanel } from './AiGeneratePanel'
import { playParams } from './audio'
import { CATEGORIES, MAX_STYLES, PARAM_GROUPS, STYLES, type Category, type Style } from './params'

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
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: space.lg,
    padding: space.lg,
  },
  spacer: {
    flex: 1,
  },
})

export function App() {
  const session = useZzfxSession()
  const [playError, setPlayError] = useState<string | null>(null)

  const handlePlay = () => {
    setPlayError(null)
    playParams(session.params).catch((err) => {
      setPlayError(err instanceof Error ? err.message : String(err))
    })
  }

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
          title={session.standalone ? 'Save disabled — no host connection' : 'Save'}
          disabled={session.standalone || session.saving || !session.findingId}
          onClick={() => void session.save()}
        />
        <div {...stylex.props(styles.spacer)} />
        {subtitle && <span {...stylex.props(styles.banner)}>{subtitle}</span>}
      </Toolbar>

      {session.standalone && (
        <div {...stylex.props(styles.banner, styles.infoBanner)}>
          Standalone mode — not connected to a host. Play works with default params; Save is
          disabled.
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

      <div {...stylex.props(styles.body)}>
        <Panel title="Category" bodyPadding="normal">
          <PillGroup<Category>
            options={CATEGORIES}
            selected={session.category ? [session.category as Category] : []}
            onChange={(next) => session.setCategory(next[0] ?? null)}
            aria-label="Sound category"
          />
        </Panel>

        <Panel title={`Style (max ${MAX_STYLES})`} bodyPadding="normal">
          <PillGroup<Style>
            options={STYLES}
            selected={session.styles as Style[]}
            onChange={(next) => session.setStyles(next)}
            multiple
            max={MAX_STYLES}
            aria-label={`Sound style, up to ${MAX_STYLES}`}
          />
        </Panel>

        {PARAM_GROUPS.map((g) => (
          <ParamGroup
            key={g.key}
            groupKey={g.key}
            params={session.params}
            onChangeParam={session.setParam}
          />
        ))}

        <AiGeneratePanel />
      </div>

      <DevReloadToast />
    </div>
  )
}
