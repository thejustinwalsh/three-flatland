import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  CardFooter as VanillaCardFooter,
  type CardFooterProperties as VanillaCardFooterProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { CardFooter as VanillaCardFooter } from '@three-flatland/uikit-default'

export type CardFooterProperties = VanillaCardFooterProperties & {
  children?: ReactNode
} & ClassListProperties

export const CardFooter: ForwardRefExoticComponent<
  PropsWithoutRef<CardFooterProperties> & RefAttributes<VanillaCardFooter>
> = /* @__PURE__ */ build<VanillaCardFooter, CardFooterProperties>(
  VanillaCardFooter,
  'VanillaDefaultCardFooter'
)
