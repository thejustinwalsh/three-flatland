// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { loadYoga } from 'yoga-layout/load'
import { Object3D } from 'three'
import { Tabs, TabsTrigger } from './index.js'

let realFetch: typeof globalThis.fetch
beforeAll(async () => {
  await loadYoga() // loads the Yoga WASM via fetch — must run BEFORE fetch is stubbed
  // Text/icon components kick off a default-font fetch on construction; there is no server in
  // tests, so pin fetch to a never-settling promise to keep the async font load from logging
  // ECONNREFUSED noise.
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

function mountTab(tabsValue: string | undefined, triggerValue: string) {
  const tabs = new Tabs({ value: tabsValue })
  const trigger = new TabsTrigger({ value: triggerValue })
  tabs.add(trigger)
  new Object3D().add(tabs)
  return { tabs, trigger }
}

describe('TabsTrigger a11y', () => {
  it('renders a hidden element with role=tab and aria-selected reflecting the active computed', () => {
    const { tabs, trigger } = mountTab('a', 'a')
    try {
      const el = trigger.a11yElement as HTMLButtonElement
      expect(el.tagName).toBe('BUTTON')
      expect(el.getAttribute('role')).toBe('tab')
      expect(el.getAttribute('aria-selected')).toBe('true')
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })

  it('aria-selected is false when the trigger is not the active tab', () => {
    const { tabs, trigger } = mountTab('a', 'b')
    try {
      const el = trigger.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-selected')).toBe('false')
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })

  it('updates aria-selected reactively when the active tab changes', () => {
    const { tabs, trigger } = mountTab('a', 'b')
    try {
      const el = trigger.a11yElement as HTMLButtonElement
      expect(el.getAttribute('aria-selected')).toBe('false')
      tabs.setProperties({ value: 'b' })
      expect(el.getAttribute('aria-selected')).toBe('true')
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })

  it('driving a11yElement.click() activates the trigger and selects its tab (uncontrolled)', () => {
    const { tabs, trigger } = mountTab(undefined, 'b')
    try {
      expect(tabs.currentSignal.peek()).toBeUndefined()
      trigger.a11yElement!.click()
      expect(tabs.uncontrolledSignal.peek()).toBe('b')
      expect(tabs.currentSignal.peek()).toBe('b')
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })

  it('driving a11yElement.click() calls onValueChange (controlled) and does not disable activation', () => {
    const calls: Array<string> = []
    const tabs = new Tabs({ value: 'a', onValueChange: (v) => calls.push(v) })
    const trigger = new TabsTrigger({ value: 'b' })
    tabs.add(trigger)
    new Object3D().add(tabs)
    try {
      trigger.a11yElement!.click()
      expect(calls).toEqual(['b'])
      // controlled: value prop didn't change, so uncontrolledSignal stays untouched
      expect(tabs.uncontrolledSignal.peek()).toBeUndefined()
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })

  it('disabled trigger does not activate on a11yElement.click()', () => {
    const { tabs, trigger } = mountTab(undefined, 'b')
    trigger.setProperties({ value: 'b', disabled: true })
    try {
      trigger.a11yElement!.click()
      expect(tabs.uncontrolledSignal.peek()).toBeUndefined()
      expect(tabs.currentSignal.peek()).toBeUndefined()
    } finally {
      trigger.dispose()
      tabs.dispose()
    }
  })
})
