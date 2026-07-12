export type { A11yActivationSource, A11yActivationEvent } from './activation.js'
export { dispatchActivation } from './activation.js'
export type { A11yRole } from './hidden-element.js'
export { createHtmlA11yElement, setupComponentA11y, setupAriaAttributes } from './hidden-element.js'
export type {
  Politeness,
  Announcement,
  AnnouncementBackend,
  A11yPreferences,
} from './announce/announcer.js'
export {
  announce,
  registerAnnouncementBackend,
  setA11yPreferences,
  getA11yPreferences,
} from './announce/announcer.js'
export { createDomLiveRegionBackend } from './announce/backends/dom-live-region.js'
