import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { CompactSelect, Icon, NumberField } from '@three-flatland/design-system'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space } from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'

export type AnimationDrawerHeaderProps = {
  expanded: boolean
  onToggleExpanded(): void
  /** Animation names in the current sidecar. May be empty. */
  animationNames: readonly string[]
  /** Currently selected animation, or null when none exists. */
  activeAnimation: string | null
  onSelectAnimation(name: string): void
  /** Called on +new click. Caller seeds the new animation from current selection. */
  onCreateAnimation(): void
  /** Called on Delete in the more menu. */
  onDeleteAnimation(name: string): void
  /** Called on inline rename commit. */
  onRenameAnimation(oldName: string, newName: string): void
  /** Playback. */
  isPlaying: boolean
  onTogglePlay(): void
  /** Per-animation knobs. Disabled when no animation selected. */
  fps: number
  loop: boolean
  pingPong: boolean
  onChangeFps(next: number): void
  onChangeLoop(next: boolean): void
  onChangePingPong(next: boolean): void
  /** Floating preview window (PIP) visibility toggle. */
  pipVisible: boolean
  onTogglePipVisible(): void
}

const s = stylex.create({
  // Mirrors design-system/Panel.header — same uppercase title style,
  // same panel-area background + bottom border. Spans the full width
  // of the parent container (no inset).
  //
  // paddingBlock is intentionally thinner than Panel.header (1px vs
  // space.sm/4px). The drawer header carries real form controls
  // (CompactSelect, NumberField) that are each up to ~22px tall;
  // matching Panel.header's 4+4 padding around them would push the
  // header to ~30px and tower over the sibling Atlas/Frames headers.
  //
  // paddingInline is asymmetric — left edge is tight (matches the
  // VSCode pattern of toggleable panel headers where the chevron
  // hugs the left edge with minimal inset), right edge keeps the
  // standard space.xl so the destructive cluster doesn't clash with
  // the rounded panel corner.
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingInlineStart: space.sm,
    paddingInlineEnd: space.xl,
    paddingBlock: '1px',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    backgroundColor: vscode.panelBg,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    color: vscode.panelTitleFg,
    flexShrink: 0,
  },
  chevBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.panelTitleFg,
    cursor: 'pointer',
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 600,
  },
  spacer: { flex: 1 },
  // Cluster wrappers — header content sits in three groups separated by
  // flex spacers so the visual rhythm reads "title · current animation
  // · playback knobs · animation lifecycle". Each group has a tight
  // internal gap; the larger gap between playback knobs and the
  // destructive cluster is the only "section break" we need.
  cluster: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    flexShrink: 0,
  },
  // Same as `cluster` but with a section-break gap from the cluster
  // before it. Used for the playback + destructive clusters so they
  // both sit right-aligned with a consistent visual rhythm.
  clusterSpaced: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    flexShrink: 0,
    marginInlineStart: space.lg,
  },
  // Hand-rolled icon button — matches AtlasMenu's trigger sizing so the
  // header height stays consistent with sibling Panel headers.
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
    color: vscode.fg,
    cursor: 'pointer',
  },
  iconBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    backgroundColor: 'transparent',
  },
  iconBtnOff: {
    opacity: 0.45,
  },
  fpsField: {
    width: 56,
    flexShrink: 0,
  },
  fpsUnit: {
    fontSize: '10px',
    color: vscode.descriptionFg,
    textTransform: 'lowercase',
  },
  renameInput: {
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    width: 110,
    outlineWidth: 0,
  },
})

/**
 * Panel-style header for the animation drawer. Always visible (even when
 * the drawer body is collapsed). Spans the full width of the parent.
 *
 * Layout: chevron + title on the left; everything else right-aligned
 * via a flex spacer. Dropdown uses VSCode SingleSelect; transport and
 * toggles use codicons via Icon; fps uses our NumberField primitive so
 * input chrome matches the rest of the design system.
 */
export function AnimationDrawerHeader(props: AnimationDrawerHeaderProps) {
  const {
    expanded, onToggleExpanded,
    animationNames, activeAnimation,
    onSelectAnimation, onCreateAnimation, onDeleteAnimation, onRenameAnimation,
    isPlaying, onTogglePlay,
    fps, loop, pingPong,
    onChangeFps, onChangeLoop, onChangePingPong,
    pipVisible, onTogglePipVisible,
  } = props

  const hasActive = activeAnimation != null
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  const onRenameKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (renameDraft && activeAnimation && renameDraft !== activeAnimation && !animationNames.includes(renameDraft)) {
        onRenameAnimation(activeAnimation, renameDraft)
      }
      setRenameDraft(null)
    } else if (e.key === 'Escape') {
      setRenameDraft(null)
    }
  }

  return (
    <div {...stylex.props(s.bar)}>
      <button
        type="button"
        {...stylex.props(s.chevBtn)}
        onClick={onToggleExpanded}
        aria-label={expanded ? 'Collapse animations' : 'Expand animations'}
      >
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} />
      </button>
      <span {...stylex.props(s.label)}>Animations</span>

      <span {...stylex.props(s.spacer)} />

      {/* Center cluster — current animation + rename, only present when
          there's something to select. */}
      {animationNames.length > 0 ? (
        <div {...stylex.props(s.cluster)}>
          {renameDraft != null ? (
            <input
              {...stylex.props(s.renameInput)}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => setRenameDraft(null)}
              onKeyDown={onRenameKey}
            />
          ) : (
            <CompactSelect
              value={activeAnimation ?? ''}
              options={animationNames.map((n) => ({ value: n }))}
              onChange={onSelectAnimation}
              width={130}
              aria-label="Active animation"
            />
          )}
          {hasActive ? (
            <button
              type="button"
              {...stylex.props(s.iconBtn)}
              onClick={() => activeAnimation && setRenameDraft(activeAnimation)}
              title="Rename animation"
              aria-label="Rename animation"
            >
              <Icon name="edit" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Playback cluster — transport, fps, loop, ping-pong. Sits
          beside the center cluster on the right, with a section break
          gap matching the destructive cluster below. */}
      <div {...stylex.props(s.clusterSpaced)}>
        <button
          type="button"
          {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled)}
          onClick={hasActive ? onTogglePlay : undefined}
          disabled={!hasActive}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          <Icon name={isPlaying ? 'debug-pause' : 'play'} />
        </button>

        <span {...stylex.props(s.fpsField)}>
          <NumberField
            value={fps}
            onChange={onChangeFps}
            min={1}
            max={60}
            step={1}
            disabled={!hasActive}
            aria-label="Frames per second"
          />
        </span>
        <span {...stylex.props(s.fpsUnit)}>fps</span>

        <button
          type="button"
          {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled, !loop && s.iconBtnOff)}
          onClick={hasActive ? () => onChangeLoop(!loop) : undefined}
          disabled={!hasActive}
          title={loop ? 'Loop on' : 'Loop off'}
          aria-label="Toggle loop"
        >
          <Icon name="sync" />
        </button>
        <button
          type="button"
          {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled, !pingPong && s.iconBtnOff)}
          onClick={hasActive ? () => onChangePingPong(!pingPong) : undefined}
          disabled={!hasActive}
          title={pingPong ? 'Ping-pong on' : 'Ping-pong off'}
          aria-label="Toggle ping-pong"
        >
          <Icon name="arrow-swap" />
        </button>
        <button
          type="button"
          {...stylex.props(s.iconBtn, !pipVisible && s.iconBtnOff)}
          onClick={onTogglePipVisible}
          title={pipVisible ? 'Hide preview window' : 'Show preview window'}
          aria-label="Toggle preview window"
        >
          <Icon name={pipVisible ? 'eye' : 'eye-closed'} />
        </button>
      </div>

      {/* Destructive cluster — create / delete animations. Slightly more
          space from the playback cluster so the two read as separate
          intents. */}
      <div {...stylex.props(s.clusterSpaced)}>
        <button
          type="button"
          {...stylex.props(s.iconBtn)}
          onClick={onCreateAnimation}
          title="New animation"
          aria-label="New animation"
        >
          <Icon name="add" />
        </button>
        <button
          type="button"
          {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled)}
          onClick={hasActive && activeAnimation ? () => {
            if (window.confirm(`Delete "${activeAnimation}"? This cannot be undone.`)) {
              onDeleteAnimation(activeAnimation)
            }
          } : undefined}
          disabled={!hasActive}
          title="Delete animation"
          aria-label="Delete animation"
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  )
}
