import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  CardTitle as VanillaCardTitle,
  type CardTitleProperties as VanillaCardTitleProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { CardTitle as VanillaCardTitle } from '@three-flatland/uikit-default'

export type CardTitleProperties = VanillaCardTitleProperties & {
  children?: ReactNode
} & ClassListProperties

export const CardTitle: ForwardRefExoticComponent<
  PropsWithoutRef<CardTitleProperties> & RefAttributes<VanillaCardTitle>
> = /* @__PURE__ */ build<VanillaCardTitle, CardTitleProperties>(
  VanillaCardTitle,
  'VanillaDefaultCardTitle'
)
