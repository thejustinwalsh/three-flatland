// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Object3D } from 'three'
import { loadYoga } from 'yoga-layout/load'
import { Accordion, AccordionItem, AccordionTrigger } from './index.js'

/**
 * T2.5 — the accordion trigger wires the frozen a11y contract (spec §7): `role: 'button'`,
 * `ariaExpanded` synced from the parent item's open state, and the expand/collapse toggle body
 * moved onto the trigger's own `onActivate` (previously misplaced on `AccordionItem.onClick`, which
 * would have double-fired once the trigger also handled activation — bubbled pointer clicks reach
 * both) so pointer, keyboard, AT, and future XR activation all share one handler on the actual
 * interactive element.
 */

function mount(openValue: string | undefined, itemValue: string) {
  const accordion = new Accordion()
  accordion.openItemValue.value = openValue
  const item = new AccordionItem({ value: itemValue })
  const trigger = new AccordionTrigger()
  item.add(trigger)
  accordion.add(item)
  new Object3D().add(accordion)
  return { accordion, item, trigger }
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

describe('AccordionTrigger a11y wiring', () => {
  it('mounts a hidden <button> with aria-expanded reflecting the parent item open state', () => {
    const { accordion, item, trigger } = mount('a', 'a')
    try {
      const el = trigger.a11yElement
      expect(el).toBeDefined()
      expect(el!.tagName).toBe('BUTTON')
      expect(el!.getAttribute('aria-expanded')).toBe('true')
    } finally {
      trigger.dispose()
      item.dispose()
      accordion.dispose()
    }
  })

  it('aria-expanded is false when the trigger item is not the open item', () => {
    const { accordion, item, trigger } = mount('other', 'a')
    try {
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('false')
    } finally {
      trigger.dispose()
      item.dispose()
      accordion.dispose()
    }
  })

  it('updates aria-expanded reactively when the accordion open value changes', () => {
    const { accordion, item, trigger } = mount(undefined, 'a')
    try {
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('false')
      accordion.openItemValue.value = 'a'
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('true')
      accordion.openItemValue.value = undefined
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('false')
    } finally {
      trigger.dispose()
      item.dispose()
      accordion.dispose()
    }
  })

  it('clicking the hidden a11y element opens the item through activate() (uncontrolled toggle)', () => {
    const { accordion, item, trigger } = mount(undefined, 'a')
    try {
      expect(accordion.openItemValue.peek()).toBeUndefined()

      trigger.a11yElement!.click()
      expect(accordion.openItemValue.peek()).toBe('a')
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('true')

      trigger.a11yElement!.click()
      expect(accordion.openItemValue.peek()).toBeUndefined()
      expect(trigger.a11yElement!.getAttribute('aria-expanded')).toBe('false')
    } finally {
      trigger.dispose()
      item.dispose()
      accordion.dispose()
    }
  })

  it('activating a different item swaps which item is open (single-open accordion)', () => {
    const accordion = new Accordion()
    const itemA = new AccordionItem({ value: 'a' })
    const triggerA = new AccordionTrigger()
    itemA.add(triggerA)
    const itemB = new AccordionItem({ value: 'b' })
    const triggerB = new AccordionTrigger()
    itemB.add(triggerB)
    accordion.add(itemA)
    accordion.add(itemB)
    new Object3D().add(accordion)
    try {
      triggerA.a11yElement!.click()
      expect(accordion.openItemValue.peek()).toBe('a')

      triggerB.a11yElement!.click()
      expect(accordion.openItemValue.peek()).toBe('b')
      expect(triggerA.a11yElement!.getAttribute('aria-expanded')).toBe('false')
      expect(triggerB.a11yElement!.getAttribute('aria-expanded')).toBe('true')
    } finally {
      triggerA.dispose()
      itemA.dispose()
      triggerB.dispose()
      itemB.dispose()
      accordion.dispose()
    }
  })

  it('the item no longer registers its own click handler (activation lives solely on the trigger)', () => {
    const { accordion, item, trigger } = mount(undefined, 'a')
    try {
      expect(item.properties.peek().onClick).toBeUndefined()
      expect(item.properties.peek().onActivate).toBeUndefined()
    } finally {
      trigger.dispose()
      item.dispose()
      accordion.dispose()
    }
  })
})
