import type { Signal } from '@preact/signals-core'
import type { ReadonlyProperties } from '@pmndrs/uikit-pub-sub'
import { abortableEffect } from '../../utils.js'
import { parseNumberValue, type NumberValue } from '../../properties/values.js'

type HiddenInputProperties = {
  disabled: boolean
  tabIndex: NumberValue
  autocomplete: string
  type: string
}

export function createHtmlInputElement(
  onChange: (value: string) => void,
  multiline: boolean,
  onSelectionChange: () => void
) {
  const element = document.createElement(multiline ? 'textarea' : 'input')
  const style = element.style
  style.setProperty('position', 'absolute')
  style.setProperty('left', '-1000vw')
  style.setProperty('top', '0')
  style.setProperty('pointerEvents', 'none')
  style.setProperty('opacity', '0')
  element.addEventListener('input', () => {
    onChange?.(element.value)
    onSelectionChange()
  })
  element.addEventListener('focus', onSelectionChange)
  element.addEventListener('keydown', onSelectionChange)
  element.addEventListener('keyup', onSelectionChange)
  element.addEventListener('blur', onSelectionChange)
  return element
}

export function setupHtmlInputElement(
  properties: ReadonlyProperties<HiddenInputProperties>,
  element: HTMLInputElement | HTMLTextAreaElement,
  value: Signal<string>,
  focusSkip: Signal<boolean>,
  abortSignal: AbortSignal
) {
  document.body.appendChild(element)
  abortSignal.addEventListener('abort', () => element.remove())
  abortableEffect(() => {
    element.value = value.value
  }, abortSignal)
  abortableEffect(() => {
    element.disabled = properties.value.disabled
  }, abortSignal)
  abortableEffect(() => {
    // Mode-3 focus-skip (projection sets it when the field's panel is offscreen/occluded) removes the
    // input from sequential Tab, matching setupRoleState's ownership for role-driven elements — else
    // an off-panel input stays tabbable while every other control goes tabIndex -1 (codex system #2).
    element.tabIndex = focusSkip.value ? -1 : parseNumberValue(properties.value.tabIndex)
  }, abortSignal)
  abortableEffect(() => {
    element.autocomplete = properties.value.autocomplete as AutoFill
  }, abortSignal)
  abortableEffect(() => element.setAttribute('type', properties.value.type), abortSignal)
}

// Moved to a11y/focus.ts so every component's hidden a11y element (not just Input) can drive
// `hasFocus`; re-exported here so existing importers keep working.
export { setupUpdateHasFocus } from '../../a11y/focus.js'
