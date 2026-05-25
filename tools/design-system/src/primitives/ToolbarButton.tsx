import type { ComponentProps } from 'react'
import VscodeToolbarButton from '@vscode-elements/react-elements/dist/components/VscodeToolbarButton.js'

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

export function ToolbarButton({ disabled, onMouseUp, ...rest }: ToolbarButtonProps) {
  // The Lit element reads `disabled` as a reflected boolean attribute. Spread
  // it as a stringified attribute so React renders it on the host element.
  const attrs = disabled ? { disabled: '' } : {}
  // Blur after mouse-up so a click doesn't leave a sticky focus ring on
  // the last-pressed toggleable button. Keyboard activation (Tab +
  // Enter/Space) is unaffected — the browser still drives :focus-visible
  // because no pointer event resets focus there.
  // The MouseEvent type from @lit/react is parameterised on the custom
  // element (VscodeToolbarButton) rather than HTMLElement, so we cast
  // currentTarget through unknown to call the inherited blur().
  type ToolbarMouseEvent = Parameters<NonNullable<typeof onMouseUp>>[0]
  const handleMouseUp = (e: ToolbarMouseEvent) => {
    onMouseUp?.(e)
    ;(e.currentTarget as unknown as HTMLElement).blur()
  }
  return (
    <VscodeToolbarButton
      {...(attrs as Record<string, unknown>)}
      {...rest}
      onMouseUp={handleMouseUp}
    />
  )
}
