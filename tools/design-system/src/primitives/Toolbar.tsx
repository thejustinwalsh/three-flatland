import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import type { ComponentProps } from 'react'
import { VscodeToolbarContainer } from '@vscode-elements/react-elements'
import { space } from '../tokens/space.stylex'

const s = stylex.create({
  shell: {
    paddingInline: space.lg,
    paddingBlock: space.md,
  },
})

export type ToolbarProps = Omit<
  ComponentProps<typeof VscodeToolbarContainer>,
  'style' | 'className'
> & {
  style?: StyleXStyles
}

/**
 * VSCode-native toolbar container. Matches editor/panel toolbars.
 * Adds standard inset padding so children don't sit flush against the
 * viewport edges.
 */
export function Toolbar({ style, ...rest }: ToolbarProps) {
  return <VscodeToolbarContainer {...rest} {...stylex.props(s.shell, style)} />
}
