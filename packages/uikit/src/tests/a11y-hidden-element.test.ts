// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { signal } from '@preact/signals-core'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Container } from '../index.js'
import { createHtmlA11yElement, type A11yRole } from '../a11y/hidden-element.js'

/**
 * A Component only resolves its properties (and thus mounts its a11y element) once it is
 * root-attached — `isRootAttached` is false for a bare `new Container()`. Parenting it under a
 * scene flips `isAttached`, exactly as `order.test`'s `createRoot` does.
 */
function mount(properties: ConstructorParameters<typeof Container>[0]): Container {
  const container = new Container(properties)
  new Object3D().add(container)
  return container
}

/**
 * The hidden DOM element (spec §1.2): the role → native-element table, plus the
 * `setupComponentA11y` lifecycle exercised through a real `Container` — mount on role, reactive
 * teardown on role → null, zero orphans across construct+dispose (the StrictMode shape), aria /
 * disabled sync, and pointer-free activation when the element is clicked by assistive tech.
 */

beforeAll(async () => {
  await loadYoga()
})

afterEach(() => {
  // Safety net: a test that forgot to dispose would otherwise leak its container into the next.
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

describe('createHtmlA11yElement — role → native element', () => {
  const cases: Array<[A11yRole, string, Array<[string, string]>]> = [
    ['button', 'BUTTON', []],
    ['togglebutton', 'BUTTON', [['aria-pressed', 'false']]],
    [
      'checkbox',
      'BUTTON',
      [
        ['role', 'checkbox'],
        ['aria-checked', 'false'],
      ],
    ],
    [
      'switch',
      'BUTTON',
      [
        ['role', 'switch'],
        ['aria-checked', 'false'],
      ],
    ],
    [
      'radio',
      'BUTTON',
      [
        ['role', 'radio'],
        ['aria-checked', 'false'],
      ],
    ],
    ['tab', 'BUTTON', [['role', 'tab']]],
    ['link', 'A', []],
    ['content', 'P', []],
  ]

  it.each(cases)('role %s → <%s> with the right attributes', (role, tag, attrs) => {
    const el = createHtmlA11yElement(role)
    expect(el.tagName).toBe(tag)
    for (const [name, value] of attrs) {
      expect(el.getAttribute(name)).toBe(value)
    }
    // Every hidden element is visually gone but still in the accessibility tree.
    expect(el.style.opacity).toBe('0')
    expect(el.style.pointerEvents).toBe('none')
  })

  it('role slider → <input type=range>', () => {
    const el = createHtmlA11yElement('slider') as HTMLInputElement
    expect(el.tagName).toBe('INPUT')
    expect(el.type).toBe('range')
  })

  it('role image → <img> with a transparent source', () => {
    const el = createHtmlA11yElement('image') as HTMLImageElement
    expect(el.tagName).toBe('IMG')
    expect(el.getAttribute('src')).toContain('svg')
  })

  it('an unimplemented role (listbox) warns once and falls back to <p> content', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(createHtmlA11yElement('listbox').tagName).toBe('P')
      createHtmlA11yElement('listbox') // second time: already warned, stays quiet
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})

describe('setupComponentA11y — Component-driven hidden element', () => {
  it('mounts a hidden element inside a per-root [data-uikit-a11y] container', () => {
    const c = mount({ role: 'button', ariaLabel: 'Play' })
    try {
      const container = document.querySelector('[data-uikit-a11y]')
      expect(container).not.toBeNull()
      const el = c.a11yElement
      expect(el).toBeDefined()
      expect(el!.tagName).toBe('BUTTON')
      expect(el!.getAttribute('aria-label')).toBe('Play')
      expect(container!.contains(el!)).toBe(true)
    } finally {
      c.dispose()
    }
  })

  it('creates the element only once a role is set; role → null removes it and its container', () => {
    const role = signal<A11yRole | undefined>(undefined)
    const c = mount({ role })
    try {
      // No role → zero cost: no element, no container.
      expect(c.a11yElement).toBeUndefined()
      expect(document.querySelectorAll('[data-uikit-a11y]')).toHaveLength(0)

      role.value = 'button'
      expect(c.a11yElement?.tagName).toBe('BUTTON')
      expect(document.querySelectorAll('[data-uikit-a11y]')).toHaveLength(1)

      role.value = undefined
      expect(c.a11yElement).toBeUndefined()
      expect(document.querySelectorAll('[data-uikit-a11y]')).toHaveLength(0)
    } finally {
      c.dispose()
    }
  })

  it('leaves zero orphan elements or containers across repeated construct+dispose (StrictMode)', () => {
    for (let i = 0; i < 2; i++) {
      const c = mount({ role: 'button', ariaLabel: 'X' })
      expect(document.querySelectorAll('[data-uikit-a11y]')).toHaveLength(1)
      expect(document.querySelectorAll('[data-uikit-a11y] button')).toHaveLength(1)
      c.dispose()
      expect(document.querySelectorAll('[data-uikit-a11y]')).toHaveLength(0)
      expect(document.querySelectorAll('button')).toHaveLength(0)
    }
  })

  it('syncs aria-label reactively on signal writes', () => {
    const ariaLabel = signal<string | undefined>('First')
    const c = mount({ role: 'button', ariaLabel })
    try {
      expect(c.a11yElement!.getAttribute('aria-label')).toBe('First')
      ariaLabel.value = 'Second'
      expect(c.a11yElement!.getAttribute('aria-label')).toBe('Second')
      ariaLabel.value = undefined
      expect(c.a11yElement!.hasAttribute('aria-label')).toBe(false)
    } finally {
      c.dispose()
    }
  })

  it('disabled sets the native disabled flag, aria-disabled, and tabIndex -1', () => {
    const disabled = signal(true)
    const c = mount({ role: 'button', ariaLabel: 'Go', disabled })
    try {
      const el = c.a11yElement as HTMLButtonElement
      expect(el.disabled).toBe(true)
      expect(el.getAttribute('aria-disabled')).toBe('true')
      expect(el.tabIndex).toBe(-1)

      disabled.value = false
      expect(el.disabled).toBe(false)
      expect(el.hasAttribute('aria-disabled')).toBe(false)
      expect(el.tabIndex).toBe(0)
    } finally {
      c.dispose()
    }
  })

  it('a click on the hidden element activates the component as a screen-reader source', () => {
    const c = mount({ role: 'button', ariaLabel: 'Go' })
    try {
      const activate = vi.spyOn(c, 'activate')
      c.a11yElement!.click()
      expect(activate).toHaveBeenCalledTimes(1)
      expect(activate.mock.calls[0]![0]).toMatchObject({ source: 'screen-reader' })
    } finally {
      c.dispose()
    }
  })
})
