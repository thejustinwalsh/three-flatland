import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  TabsList as VanillaTabsList,
  type TabsListProperties as VanillaTabsListProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { TabsList as VanillaTabsList } from '@three-flatland/uikit-default'

export type TabsListProperties = VanillaTabsListProperties & {
  children?: ReactNode
} & ClassListProperties

export const TabsList: ForwardRefExoticComponent<
  PropsWithoutRef<TabsListProperties> & RefAttributes<VanillaTabsList>
> = /* @__PURE__ */ build<VanillaTabsList, TabsListProperties>(
  VanillaTabsList,
  'VanillaDefaultTabsList'
)
