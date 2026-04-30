import type { ComponentProps } from 'react'
import VscodeButton from '@vscode-elements/react-elements/dist/components/VscodeButton.js'

/**
 * VSCode-native Button. Wraps vscode-button (Lit) with its React binding.
 * Styling, focus ring, hover, disabled — all from VSCode itself.
 */
export type ButtonProps = ComponentProps<typeof VscodeButton>

export function Button(props: ButtonProps) {
  return <VscodeButton {...props} />
}
