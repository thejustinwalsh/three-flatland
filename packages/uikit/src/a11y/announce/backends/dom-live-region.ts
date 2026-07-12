import type { Announcement, AnnouncementBackend } from '../announcer.js'

const offScreenStyle =
  'border:0;clip:rect(0 0 0 0);height:1px;margin:-1px;overflow:hidden;white-space:nowrap;padding:0;width:1px;position:absolute;'

/**
 * Default browser backend: one off-screen `aria-live` region per politeness level, mounted on
 * `document.body`. Clears the text then sets it ~100 ms later so an identical repeat message
 * still re-announces (react-three-a11y's trick, framework-free — no zustand).
 */
export function createDomLiveRegionBackend(): AnnouncementBackend {
  const regions = new Map<string, HTMLElement>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const ensure = (politeness: string): HTMLElement => {
    let element = regions.get(politeness)
    if (element == null) {
      element = document.createElement('div')
      element.setAttribute('aria-live', politeness)
      element.setAttribute('aria-atomic', 'true')
      element.style.cssText = offScreenStyle
      document.body.appendChild(element)
      regions.set(politeness, element)
    }
    return element
  }

  return {
    announce(a: Announcement) {
      const element = ensure(a.politeness)
      const pending = timers.get(a.politeness)
      if (pending != null) {
        clearTimeout(pending)
      }
      element.textContent = ''
      timers.set(
        a.politeness,
        setTimeout(() => {
          element.textContent = a.message
          timers.delete(a.politeness)
        }, 100)
      )
    },
    dispose() {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
      for (const element of regions.values()) {
        element.remove()
      }
      regions.clear()
    },
  }
}
