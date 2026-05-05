import * as stylex from '@stylexjs/stylex'
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'

const s = stylex.create({
  track: {
    position: 'relative',
    width: '100%',
    height: 6,
    backgroundColor: vscode.inputBg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.inputBorder,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    backgroundColor: vscode.btnBg,
    transitionProperty: 'width',
    transitionDuration: '120ms',
  },
  fillOver: {
    backgroundColor: vscode.errorFg,
  },
  fillTransform: (width: string) => ({ width }),
})

export interface InfoBarProps {
  /** 0..1 (clamped). >1 indicates regression and gets the error color. */
  ratio: number
}

export function InfoBar({ ratio }: InfoBarProps) {
  const over = ratio > 1
  const clamped = Math.max(0, Math.min(1, ratio))
  return (
    <div {...stylex.props(s.track)}>
      <span
        {...stylex.props(
          s.fill,
          over && s.fillOver,
          s.fillTransform(`${clamped * 100}%`),
        )}
      />
    </div>
  )
}
