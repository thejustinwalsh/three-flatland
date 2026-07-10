import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  TabsTrigger as VanillaTabsTrigger,
  type TabsTriggerProperties as VanillaTabsTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { TabsTrigger as VanillaTabsTrigger } from '@three-flatland/uikit-default'

export type TabsTriggerProperties = VanillaTabsTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const TabsTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<TabsTriggerProperties> & RefAttributes<VanillaTabsTrigger>
> = /* @__PURE__ */ build<VanillaTabsTrigger, TabsTriggerProperties>(
  VanillaTabsTrigger,
  'VanillaDefaultTabsTrigger'
)
