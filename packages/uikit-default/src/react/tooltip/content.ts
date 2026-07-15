import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  TooltipContent as VanillaTooltipContent,
  type TooltipContentProperties as VanillaTooltipContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { TooltipContent as VanillaTooltipContent } from '@three-flatland/uikit-default'

export type TooltipContentProperties = VanillaTooltipContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const TooltipContent: ForwardRefExoticComponent<
  PropsWithoutRef<TooltipContentProperties> & RefAttributes<VanillaTooltipContent>
> = /* @__PURE__ */ build<VanillaTooltipContent, TooltipContentProperties>(
  VanillaTooltipContent,
  'VanillaDefaultTooltipContent'
)
