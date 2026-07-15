import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  CardHeader as VanillaCardHeader,
  type CardHeaderProperties as VanillaCardHeaderProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { CardHeader as VanillaCardHeader } from '@three-flatland/uikit-default'

export type CardHeaderProperties = VanillaCardHeaderProperties & {
  children?: ReactNode
} & ClassListProperties

export const CardHeader: ForwardRefExoticComponent<
  PropsWithoutRef<CardHeaderProperties> & RefAttributes<VanillaCardHeader>
> = /* @__PURE__ */ build<VanillaCardHeader, CardHeaderProperties>(
  VanillaCardHeader,
  'VanillaDefaultCardHeader'
)
