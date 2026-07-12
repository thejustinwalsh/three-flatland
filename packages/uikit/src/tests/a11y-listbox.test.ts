// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { createHtmlA11yElement } from '../a11y/hidden-element.js'

/**
 * Virtualized listbox role (spec §8, WAI-ARIA APG listbox): ONE focusable role="listbox" element
 * with ONE managed role="option" child re-labelled as the active index moves. Keydown translates
 * to app-owned move tokens — the app owns geometry/scroll; no rows/columns are computed here.
 */

function mount(properties: ConstructorParameters<typeof Container>[0]): Container {
  const container = new Container(properties)
  new Object3D().add(container)
  return container
}

beforeAll(async () => {
  await loadYoga()
})

afterEach(() => {
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

describe('createHtmlA11yElement — listbox', () => {
  it('builds a focusable listbox with one managed option child as its active descendant', () => {
    const listbox = createHtmlA11yElement('listbox')
    expect(listbox.tagName).toBe('DIV')
    expect(listbox.getAttribute('role')).toBe('listbox')
    expect(listbox.getAttribute('tabindex')).toBe('0')

    const option = listbox.querySelector('[role=option]')
    expect(option).not.toBeNull()
    expect(option!.id).not.toBe('')
    expect(listbox.getAttribute('aria-activedescendant')).toBe(option!.id)

    // Visually gone but in the accessibility tree, like every hidden a11y element.
    expect(listbox.style.opacity).toBe('0')
    expect(listbox.style.pointerEvents).toBe('none')
  })

  it('mints a distinct option id per listbox', () => {
    const a = createHtmlA11yElement('listbox').querySelector('[role=option]')!
    const b = createHtmlA11yElement('listbox').querySelector('[role=option]')!
    expect(a.id).not.toBe(b.id)
  })
})

describe('setupRoleState — listbox option state', () => {
  it('syncs aria-setsize / aria-posinset / aria-selected / textContent on signal writes', () => {
    const ariaItemCount = signal(1594)
    const ariaActiveIndex = signal(0)
    const ariaActiveLabel = signal<string | undefined>('anchor')
    const ariaSelected = signal(false)
    const c = mount({
      role: 'listbox',
      ariaLabel: 'Icons',
      ariaItemCount,
      ariaActiveIndex,
      ariaActiveLabel,
      ariaSelected,
    })
    try {
      const listbox = c.a11yElement!
      const option = listbox.querySelector('[role=option]')!
      expect(listbox.getAttribute('aria-activedescendant')).toBe(option.id)
      expect(option.getAttribute('aria-setsize')).toBe('1594')
      expect(option.getAttribute('aria-posinset')).toBe('1')
      expect(option.getAttribute('aria-selected')).toBe('false')
      expect(option.textContent).toBe('anchor')

      ariaItemCount.value = 42
      ariaActiveIndex.value = 7
      ariaActiveLabel.value = 'badge'
      ariaSelected.value = true
      expect(option.getAttribute('aria-setsize')).toBe('42')
      expect(option.getAttribute('aria-posinset')).toBe('8')
      expect(option.getAttribute('aria-selected')).toBe('true')
      expect(option.textContent).toBe('badge')

      ariaActiveLabel.value = undefined
      expect(option.textContent).toBe('')
    } finally {
      c.dispose()
    }
  })

  it('honors shared disabled handling: tabIndex 0 enabled, -1 disabled', () => {
    const disabled = signal(false)
    const c = mount({ role: 'listbox', ariaLabel: 'Icons', disabled })
    try {
      const listbox = c.a11yElement!
      expect(listbox.tabIndex).toBe(0)
      disabled.value = true
      expect(listbox.tabIndex).toBe(-1)
      expect(listbox.getAttribute('aria-disabled')).toBe('true')
    } finally {
      c.dispose()
    }
  })
})

describe('listbox keydown grammar', () => {
  const moves: Array<[string, string]> = [
    ['ArrowRight', 'next'],
    ['ArrowLeft', 'prev'],
    ['ArrowDown', 'nextRow'],
    ['ArrowUp', 'prevRow'],
    ['Home', 'first'],
    ['End', 'last'],
  ]

  it.each(moves)('%s → onA11yActiveIndexChange({ move: %s }) and preventDefault', (key, move) => {
    const onA11yActiveIndexChange = vi.fn()
    const c = mount({ role: 'listbox', ariaLabel: 'Icons', onA11yActiveIndexChange })
    try {
      const event = new KeyboardEvent('keydown', { key, cancelable: true })
      c.a11yElement!.dispatchEvent(event)
      expect(onA11yActiveIndexChange).toHaveBeenCalledTimes(1)
      expect(onA11yActiveIndexChange).toHaveBeenCalledWith({ move })
      expect(event.defaultPrevented).toBe(true)
    } finally {
      c.dispose()
    }
  })

  it.each([['Enter'], [' ']])('%j → onA11yActivate(currentIndex)', (key) => {
    const onA11yActivate = vi.fn()
    const ariaActiveIndex = signal(11)
    const c = mount({ role: 'listbox', ariaLabel: 'Icons', ariaActiveIndex, onA11yActivate })
    try {
      const event = new KeyboardEvent('keydown', { key, cancelable: true })
      c.a11yElement!.dispatchEvent(event)
      expect(onA11yActivate).toHaveBeenCalledTimes(1)
      expect(onA11yActivate).toHaveBeenCalledWith(11)
      expect(event.defaultPrevented).toBe(true)
    } finally {
      c.dispose()
    }
  })

  it('Enter with no ariaActiveIndex activates index 0', () => {
    const onA11yActivate = vi.fn()
    const c = mount({ role: 'listbox', ariaLabel: 'Icons', onA11yActivate })
    try {
      c.a11yElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
      expect(onA11yActivate).toHaveBeenCalledWith(0)
    } finally {
      c.dispose()
    }
  })

  it('a disabled listbox ignores arrow/Enter keydown (codex P2 #2)', () => {
    const onA11yActiveIndexChange = vi.fn()
    const onA11yActivate = vi.fn()
    const c = mount({
      role: 'listbox',
      ariaLabel: 'Icons',
      disabled: true,
      onA11yActiveIndexChange,
      onA11yActivate,
    })
    try {
      c.a11yElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
      c.a11yElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
      expect(onA11yActiveIndexChange).not.toHaveBeenCalled()
      expect(onA11yActivate).not.toHaveBeenCalled()
    } finally {
      c.dispose()
    }
  })

  it('unmapped keys neither fire callbacks nor preventDefault', () => {
    const onA11yActiveIndexChange = vi.fn()
    const onA11yActivate = vi.fn()
    const c = mount({
      role: 'listbox',
      ariaLabel: 'Icons',
      onA11yActiveIndexChange,
      onA11yActivate,
    })
    try {
      const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
      c.a11yElement!.dispatchEvent(event)
      expect(onA11yActiveIndexChange).not.toHaveBeenCalled()
      expect(onA11yActivate).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    } finally {
      c.dispose()
    }
  })
})
