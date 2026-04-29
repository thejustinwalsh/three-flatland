import { useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
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
  /** Called on Delete in the ⋯ menu. */
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
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.sm,
    paddingInline: space.md,
    paddingBlock: space.xs,
    color: vscode.fg,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    flexShrink: 0,
  },
  chev: {
    background: 'transparent',
    borderWidth: 0,
    color: vscode.panelTitleFg,
    cursor: 'pointer',
    padding: 0,
    width: 14,
    fontSize: '10px',
  },
  label: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: vscode.panelTitleFg,
  },
  labelMuted: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: vscode.descriptionFg,
  },
  select: {
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    minWidth: 80,
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
    width: 100,
    outlineWidth: 0,
  },
  chip: {
    backgroundColor: vscode.bg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    cursor: 'pointer',
    userSelect: 'none',
  },
  chipOff: {
    opacity: 0.5,
  },
  chipDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  fpsField: {
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    paddingInline: space.sm,
    paddingBlock: '1px',
    fontSize: '11px',
    fontFamily: vscode.monoFontFamily,
    width: 50,
  },
  iconBtn: {
    background: 'transparent',
    color: vscode.fg,
    borderWidth: 0,
    borderRadius: radius.sm,
    paddingInline: space.xs,
    paddingBlock: '1px',
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: vscode.monoFontFamily,
  },
  iconBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  fpsUnit: {
    fontSize: '10px',
    color: vscode.descriptionFg,
    marginInlineStart: -2,
  },
  spacer: { flex: 1 },
})

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
        {...stylex.props(s.chev)}
        onClick={onToggleExpanded}
        aria-label={expanded ? 'Collapse animations' : 'Expand animations'}
      >
        {expanded ? '▼' : '▶'}
      </button>
      <span {...stylex.props(s.label)}>Animations</span>

      {animationNames.length === 0 ? (
        <span {...stylex.props(s.labelMuted)}>(none)</span>
      ) : renameDraft != null ? (
        <input
          {...stylex.props(s.renameInput)}
          autoFocus
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={() => setRenameDraft(null)}
          onKeyDown={onRenameKey}
        />
      ) : (
        <select
          {...stylex.props(s.select)}
          value={activeAnimation ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onSelectAnimation(e.target.value)}
          onDoubleClick={() => activeAnimation && setRenameDraft(activeAnimation)}
          title="Double-click to rename"
        >
          {animationNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}

      <button
        type="button"
        {...stylex.props(s.iconBtn, !hasActive && s.iconBtnDisabled)}
        onClick={hasActive ? onTogglePlay : undefined}
        disabled={!hasActive}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <input
        type="number"
        min={1}
        max={60}
        step={1}
        {...stylex.props(s.fpsField, !hasActive && s.chipDisabled)}
        value={fps}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChangeFps(Math.max(1, Math.min(60, Math.round(v))))
        }}
        disabled={!hasActive}
        title="Frames per second"
      />
      <span {...stylex.props(s.fpsUnit)}>fps</span>

      <button
        type="button"
        {...stylex.props(s.chip, !loop && s.chipOff, !hasActive && s.chipDisabled)}
        onClick={hasActive ? () => onChangeLoop(!loop) : undefined}
        disabled={!hasActive}
        title="Loop"
      >
        loop
      </button>
      <button
        type="button"
        {...stylex.props(s.chip, !pingPong && s.chipOff, !hasActive && s.chipDisabled)}
        onClick={hasActive ? () => onChangePingPong(!pingPong) : undefined}
        disabled={!hasActive}
        title="Ping-pong"
      >
        ↺
      </button>

      <span {...stylex.props(s.spacer)} />

      <button
        type="button"
        {...stylex.props(s.iconBtn)}
        onClick={onCreateAnimation}
        title="New animation"
      >
        ＋
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
      >
        ⋯
      </button>
    </div>
  )
}
