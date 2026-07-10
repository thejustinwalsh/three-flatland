import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AccordionItem as VanillaAccordionItem,
  type AccordionItemProperties as VanillaAccordionItemProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AccordionItem as VanillaAccordionItem } from '@three-flatland/uikit-default'

export type AccordionItemProperties = VanillaAccordionItemProperties & {
  children?: ReactNode
} & ClassListProperties

export const AccordionItem: ForwardRefExoticComponent<
  PropsWithoutRef<AccordionItemProperties> & RefAttributes<VanillaAccordionItem>
> = /* @__PURE__ */ build<VanillaAccordionItem, AccordionItemProperties>(
  VanillaAccordionItem,
  'VanillaDefaultAccordionItem'
)
