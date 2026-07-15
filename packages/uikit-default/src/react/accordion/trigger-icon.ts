import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AccordionTriggerIcon as VanillaAccordionTriggerIcon,
  type AccordionTriggerIconProperties as VanillaAccordionTriggerIconProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AccordionTriggerIcon as VanillaAccordionTriggerIcon } from '@three-flatland/uikit-default'

export type AccordionTriggerIconProperties = VanillaAccordionTriggerIconProperties &
  ClassListProperties

export const AccordionTriggerIcon: ForwardRefExoticComponent<
  PropsWithoutRef<AccordionTriggerIconProperties> & RefAttributes<VanillaAccordionTriggerIcon>
> = /* @__PURE__ */ build<VanillaAccordionTriggerIcon, AccordionTriggerIconProperties>(
  VanillaAccordionTriggerIcon,
  'VanillaDefaultAccordionTriggerIcon'
)
