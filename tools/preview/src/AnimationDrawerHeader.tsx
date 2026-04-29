import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Icon, NumberField, Option, SingleSelect } from '@three-flatland/design-system'
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
}

const s = stylex.create({
  // Mirrors design-system/Panel.header — same paddings, same uppercase
  // title style, same panel-area background + bottom border. Spans the
  // full width of the parent container (no inset).
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingInline: space.xl,
    paddingBlock: space.sm,
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
    background: 'transparent',
    borderWidth: 0,
    color: vscode.panelTitleFg,
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 600,
  },
  labelMuted: {
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: vscode.descriptionFg,
    marginInlineStart: space.sm,
  },
  spacer: { flex: 1 },
  // Right cluster — every interactive control sits here, never inline
  // with the title.
  controls: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.sm,
    flexShrink: 0,
  },
  selectWrap: {
    minWidth: 110,
  },
  // Hand-rolled icon button — matches AtlasMenu's trigger sizing so the
  // header height stays consistent with sibling Panel headers.
  iconBtn: {
    background: 'transparent',
    color: vscode.fg,
    borderWidth: 0,
    borderRadius: radius.sm,
    padding: 0,
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backgroundColor: { default: 'transparent', ':hover': vscode.bg },
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
      {animationNames.length === 0 ? (
        <span {...stylex.props(s.labelMuted)}>(none)</span>
      ) : null}

      <span {...stylex.props(s.spacer)} />

      <div {...stylex.props(s.controls)}>
        {animationNames.length > 0 ? (
          renameDraft != null ? (
            <input
              {...stylex.props(s.renameInput)}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => setRenameDraft(null)}
              onKeyDown={onRenameKey}
            />
          ) : (
            <span {...stylex.props(s.selectWrap)}>
              <SingleSelect
                value={activeAnimation ?? ''}
                onChange={(e: Event) => {
                  const target = e.target as HTMLElement & { value?: string }
                  if (typeof target.value === 'string') onSelectAnimation(target.value)
                }}
              >
                {animationNames.map((n) => (
                  <Option key={n} value={n}>{n}</Option>
                ))}
              </SingleSelect>
            </span>
          )
        ) : null}

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
