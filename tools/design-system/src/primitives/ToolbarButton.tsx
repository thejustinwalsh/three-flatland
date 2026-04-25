import type { ComponentProps } from 'react'
import { VscodeToolbarButton } from '@vscode-elements/react-elements'

/**
 * VSCode-native toolbar button. Wraps the Lit React binding to expose
 * `disabled` (which the underlying Lit element honors as an HTML attribute
 * but `@lit/react` strips from the React type because it isn't part of
 * `React.HTMLAttributes`). We forward it through as a string attribute
 * for the Lit element to read.
 */
export type ToolbarButtonProps = ComponentProps<typeof VscodeToolbarButton> & {
  disabled?: boolean
}

export function ToolbarButton({ disabled, ...rest }: ToolbarButtonProps) {
  // The Lit element reads `disabled` as a reflected boolean attribute. Spread
  // it as a stringified attribute so React renders it on the host element.
  const attrs = disabled ? { disabled: '' } : {}
  return <VscodeToolbarButton {...(attrs as Record<string, unknown>)} {...rest} />
}
