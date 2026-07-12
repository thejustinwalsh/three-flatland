// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { ToggleGroup, ToggleGroupItem } from './index.js'

/**
 * Phase 2 native a11y wiring (spec §7): role: 'togglebutton', ariaPressed reflecting
 * currentSignal, and behavior moved from onClick to onActivate so pointer, keyboard,
 * and AT all drive the same toggle logic through Component.activate().
 *
 * Note: the actual toggle state lives on ToggleGroupItem (toggle-group/item.ts) — the
 * ToggleGroup container itself (toggle-group/index.ts) is a plain layout wrapper with no
 * checked state and no onClick, so it does not get a togglebutton role.
 */

function mountItem(item: ToggleGroupItem): ToggleGroupItem {
  const group = new ToggleGroup()
  new Object3D().add(group)
  group.add(item)
  return item
}

let realFetch: typeof globalThis.fetch
beforeAll(async () => {
  await loadYoga() // loads the Yoga WASM via fetch — must run BEFORE fetch is stubbed
  realFetch = globalThis.fetch
  globalThis.fetch = (() => new Promise<never>(() => {})) as typeof globalThis.fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

afterEach(() => {
  for (const el of document.querySelectorAll('[data-uikit-a11y]')) {
    el.remove()
  }
})

describe('ToggleGroupItem a11y wiring', () => {
  it('exposes a togglebutton with aria-pressed reflecting the unchecked default', () => {
    const item = mountItem(new ToggleGroupItem())
    try {
      const el = item.a11yElement as HTMLButtonElement
      expect(el.tagName).toBe('BUTTON')
      expect(el.getAttribute('aria-pressed')).toBe('false')
    } finally {
      item.dispose()
    }
  })

  it('reflects defaultChecked through aria-pressed', () => {
    const item = mountItem(new ToggleGroupItem({ defaultChecked: true }))
    try {
      const el = item.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-pressed')).toBe('true')
    } finally {
      item.dispose()
    }
  })

  it('clicking the hidden a11y element (AT/keyboard path) flips the uncontrolled state', () => {
    const item = mountItem(new ToggleGroupItem())
    try {
      expect(item.currentSignal.peek()).toBeUndefined()
      item.a11yElement!.click()
      expect(item.currentSignal.peek()).toBe(true)
      expect(item.a11yElement!.getAttribute('aria-pressed')).toBe('true')

      item.a11yElement!.click()
      expect(item.currentSignal.peek()).toBe(false)
      expect(item.a11yElement!.getAttribute('aria-pressed')).toBe('false')
    } finally {
      item.dispose()
    }
  })

  it('does not flip a controlled item on activation, but still calls onCheckedChange', () => {
    let lastChecked: boolean | undefined
    const item = mountItem(
      new ToggleGroupItem({ checked: false, onCheckedChange: (checked) => (lastChecked = checked) })
    )
    try {
      item.a11yElement!.click()
      expect(lastChecked).toBe(true)
      expect(item.currentSignal.peek()).toBe(false)
    } finally {
      item.dispose()
    }
  })

  it('activation is a no-op while disabled', () => {
    let onCheckedChangeCalls = 0
    const item = mountItem(
      new ToggleGroupItem({ disabled: true, onCheckedChange: () => (onCheckedChangeCalls += 1) })
    )
    try {
      item.a11yElement!.click()
      expect(onCheckedChangeCalls).toBe(0)
      expect(item.currentSignal.peek()).toBeUndefined()
    } finally {
      item.dispose()
    }
  })
})
