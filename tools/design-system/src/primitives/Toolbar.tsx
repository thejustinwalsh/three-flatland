import type { ComponentProps } from 'react'
import { VscodeToolbarContainer } from '@vscode-elements/react-elements'

/**
 * VSCode-native toolbar container. Matches editor/panel toolbars.
 */
export type ToolbarProps = ComponentProps<typeof VscodeToolbarContainer>

export function Toolbar(props: ToolbarProps) {
  return <VscodeToolbarContainer {...props} />
}
