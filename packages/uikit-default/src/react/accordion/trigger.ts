import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AccordionTrigger as VanillaAccordionTrigger,
  type AccordionTriggerProperties as VanillaAccordionTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AccordionTrigger as VanillaAccordionTrigger } from '@three-flatland/uikit-default'

export type AccordionTriggerProperties = VanillaAccordionTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const AccordionTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<AccordionTriggerProperties> & RefAttributes<VanillaAccordionTrigger>
> = /* @__PURE__ */ build<VanillaAccordionTrigger, AccordionTriggerProperties>(
  VanillaAccordionTrigger,
  'VanillaDefaultAccordionTrigger'
)
