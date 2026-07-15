import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Card as VanillaCard,
  type CardProperties as VanillaCardProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Card as VanillaCard } from '@three-flatland/uikit-default'

export type CardProperties = VanillaCardProperties & { children?: ReactNode } & ClassListProperties

export const Card: ForwardRefExoticComponent<
  PropsWithoutRef<CardProperties> & RefAttributes<VanillaCard>
> = /* @__PURE__ */ build<VanillaCard, CardProperties>(VanillaCard, 'VanillaDefaultCard')

export * from './content.js'
export * from './description.js'
export * from './footer.js'
export * from './header.js'
export * from './title.js'
