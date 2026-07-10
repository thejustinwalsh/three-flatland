import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AccordionContent as VanillaAccordionContent,
  type AccordionContentProperties as VanillaAccordionContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AccordionContent as VanillaAccordionContent } from '@three-flatland/uikit-default'

export type AccordionContentProperties = VanillaAccordionContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const AccordionContent: ForwardRefExoticComponent<
  PropsWithoutRef<AccordionContentProperties> & RefAttributes<VanillaAccordionContent>
> = /* @__PURE__ */ build<VanillaAccordionContent, AccordionContentProperties>(
  VanillaAccordionContent,
  'VanillaDefaultAccordionContent'
)
