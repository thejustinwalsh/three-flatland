import type { Signal } from '@preact/signals-core'

/**
 * Mirrors a hidden DOM element's focus state into a `hasFocus` signal and notifies on change.
 * Moved verbatim from `text/input/hidden-input.ts` (which re-exports it) so every component's
 * hidden a11y element — not just `Input` — can drive the base-class `hasFocus` conditional.
 */
export function setupUpdateHasFocus(
  element: HTMLElement,
  hasFocusSignal: Signal<boolean>,
  onFocusChange: (focus: boolean) => void,
  abortSignal: AbortSignal
) {
  if (abortSignal.aborted) {
    return
  }
  hasFocusSignal.value = document.activeElement === element
  const listener = () => {
    const hasFocus = document.activeElement === element
    if (hasFocus == hasFocusSignal.value) {
      return
    }
    hasFocusSignal.value = hasFocus
    onFocusChange(hasFocus)
  }
  element.addEventListener('focus', listener)
  element.addEventListener('blur', listener)
  abortSignal.addEventListener('abort', () => {
    element.removeEventListener('focus', listener)
    element.removeEventListener('blur', listener)
    // Removing a focused element (role → undefined, or dispose) fires no blur, so the signal would
    // stay stuck true and onFocusChange(false) never run — reset it here on teardown.
    if (hasFocusSignal.value) {
      hasFocusSignal.value = false
      onFocusChange(false)
    }
  })
}
