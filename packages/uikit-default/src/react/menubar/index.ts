import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Menubar as VanillaMenubar,
  type MenubarProperties as VanillaMenubarProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Menubar as VanillaMenubar } from '@three-flatland/uikit-default'

export type MenubarProperties = VanillaMenubarProperties & {
  children?: ReactNode
} & ClassListProperties

export const Menubar: ForwardRefExoticComponent<
  PropsWithoutRef<MenubarProperties> & RefAttributes<VanillaMenubar>
> = /* @__PURE__ */ build<VanillaMenubar, MenubarProperties>(
  VanillaMenubar,
  'VanillaDefaultMenubar'
)

export * from './menu.js'
export * from './trigger.js'
