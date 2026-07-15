import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  TabsContent as VanillaTabsContent,
  type TabsContentProperties as VanillaTabsContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { TabsContent as VanillaTabsContent } from '@three-flatland/uikit-default'

export type TabsContentProperties = VanillaTabsContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const TabsContent: ForwardRefExoticComponent<
  PropsWithoutRef<TabsContentProperties> & RefAttributes<VanillaTabsContent>
> = /* @__PURE__ */ build<VanillaTabsContent, TabsContentProperties>(
  VanillaTabsContent,
  'VanillaDefaultTabsContent'
)
