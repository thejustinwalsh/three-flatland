import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Accordion as VanillaAccordion,
  type AccordionProperties as VanillaAccordionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Accordion as VanillaAccordion } from '@three-flatland/uikit-default'

export type AccordionProperties = VanillaAccordionProperties & {
  children?: ReactNode
} & ClassListProperties

export const Accordion: ForwardRefExoticComponent<
  PropsWithoutRef<AccordionProperties> & RefAttributes<VanillaAccordion>
> = /* @__PURE__ */ build<VanillaAccordion, AccordionProperties>(
  VanillaAccordion,
  'VanillaDefaultAccordion'
)

export * from './content.js'
export * from './item.js'
export * from './trigger-icon.js'
export * from './trigger.js'
