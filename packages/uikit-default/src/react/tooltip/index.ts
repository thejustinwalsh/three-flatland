import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Tooltip as VanillaTooltip,
  type TooltipProperties as VanillaTooltipProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Tooltip as VanillaTooltip } from '@three-flatland/uikit-default'

export type TooltipProperties = VanillaTooltipProperties & {
  children?: ReactNode
} & ClassListProperties

export const Tooltip: ForwardRefExoticComponent<
  PropsWithoutRef<TooltipProperties> & RefAttributes<VanillaTooltip>
> = /* @__PURE__ */ build<VanillaTooltip, TooltipProperties>(
  VanillaTooltip,
  'VanillaDefaultTooltip'
)

export * from './content.js'
export * from './trigger.js'
