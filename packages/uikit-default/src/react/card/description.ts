import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  CardDescription as VanillaCardDescription,
  type CardDescriptionProperties as VanillaCardDescriptionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { CardDescription as VanillaCardDescription } from '@three-flatland/uikit-default'

export type CardDescriptionProperties = VanillaCardDescriptionProperties & {
  children?: ReactNode
} & ClassListProperties

export const CardDescription: ForwardRefExoticComponent<
  PropsWithoutRef<CardDescriptionProperties> & RefAttributes<VanillaCardDescription>
> = /* @__PURE__ */ build<VanillaCardDescription, CardDescriptionProperties>(
  VanillaCardDescription,
  'VanillaDefaultCardDescription'
)
