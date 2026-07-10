import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  MenubarTrigger as VanillaMenubarTrigger,
  type MenubarTriggerProperties as VanillaMenubarTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { MenubarTrigger as VanillaMenubarTrigger } from '@three-flatland/uikit-default'

export type MenubarTriggerProperties = VanillaMenubarTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const MenubarTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<MenubarTriggerProperties> & RefAttributes<VanillaMenubarTrigger>
> = /* @__PURE__ */ build<VanillaMenubarTrigger, MenubarTriggerProperties>(
  VanillaMenubarTrigger,
  'VanillaDefaultMenubarTrigger'
)
