import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Tabs as VanillaTabs,
  type TabsProperties as VanillaTabsProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Tabs as VanillaTabs } from '@three-flatland/uikit-default'

export type TabsProperties = VanillaTabsProperties & { children?: ReactNode } & ClassListProperties

export const Tabs: ForwardRefExoticComponent<
  PropsWithoutRef<TabsProperties> & RefAttributes<VanillaTabs>
> = /* @__PURE__ */ build<VanillaTabs, TabsProperties>(VanillaTabs, 'VanillaDefaultTabs')

export * from './content.js'
export * from './list.js'
export * from './trigger.js'
