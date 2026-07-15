import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  CardContent as VanillaCardContent,
  type CardContentProperties as VanillaCardContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { CardContent as VanillaCardContent } from '@three-flatland/uikit-default'

export type CardContentProperties = VanillaCardContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const CardContent: ForwardRefExoticComponent<
  PropsWithoutRef<CardContentProperties> & RefAttributes<VanillaCardContent>
> = /* @__PURE__ */ build<VanillaCardContent, CardContentProperties>(
  VanillaCardContent,
  'VanillaDefaultCardContent'
)
