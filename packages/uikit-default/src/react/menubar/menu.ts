import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  MenubarMenu as VanillaMenubarMenu,
  type MenubarMenuProperties as VanillaMenubarMenuProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { MenubarMenu as VanillaMenubarMenu } from '@three-flatland/uikit-default'

export type MenubarMenuProperties = VanillaMenubarMenuProperties & {
  children?: ReactNode
} & ClassListProperties

export const MenubarMenu: ForwardRefExoticComponent<
  PropsWithoutRef<MenubarMenuProperties> & RefAttributes<VanillaMenubarMenu>
> = /* @__PURE__ */ build<VanillaMenubarMenu, MenubarMenuProperties>(
  VanillaMenubarMenu,
  'VanillaDefaultMenubarMenu'
)
