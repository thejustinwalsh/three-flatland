export type { A11yActivationSource, A11yActivationEvent } from './activation.js'
export { dispatchActivation } from './activation.js'
export type { A11yRole } from './hidden-element.js'
export { createHtmlA11yElement, setupComponentA11y, setupAriaAttributes } from './hidden-element.js'
export type { A11yScreenRect, A11yViewport, A11yProjectionOptions } from './projection.js'
export { computeA11yScreenRect, setupA11yProjection } from './projection.js'
export type { A11yVisibility, A11yVisibilityOptions } from './visibility.js'
export { classifyA11yVisibility, createRaycastOcclusionProbe } from './visibility.js'
export type { SpatialNavContext, SpatialNavDirection } from './spatial-nav.js'
export { computeSpatialOrder, focusDirectional } from './spatial-nav.js'
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
