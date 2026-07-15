import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  TooltipTrigger as VanillaTooltipTrigger,
  type TooltipTriggerProperties as VanillaTooltipTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { TooltipTrigger as VanillaTooltipTrigger } from '@three-flatland/uikit-default'

export type TooltipTriggerProperties = VanillaTooltipTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const TooltipTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<TooltipTriggerProperties> & RefAttributes<VanillaTooltipTrigger>
> = /* @__PURE__ */ build<VanillaTooltipTrigger, TooltipTriggerProperties>(
  VanillaTooltipTrigger,
  'VanillaDefaultTooltipTrigger'
)
