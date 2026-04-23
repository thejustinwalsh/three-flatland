import type { ComponentProps } from 'react'
import { VscodeToolbarContainer } from '@vscode-elements/react-elements'

/**
 * VSCode-native toolbar container. Matches editor/panel toolbars.
 * Adds standard inset padding so children don't sit flush against the
 * viewport edges.
 */
export type ToolbarProps = ComponentProps<typeof VscodeToolbarContainer>

export function Toolbar({ style, ...rest }: ToolbarProps) {
  return <VscodeToolbarContainer {...rest} style={{ padding: '6px 8px', ...style }} />
}
