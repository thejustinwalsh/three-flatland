import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Dropdown as VanillaDropdown,
  type DropdownProperties as VanillaDropdownProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Dropdown as VanillaDropdown } from '@three-flatland/uikit-horizon'

export type DropdownProperties = VanillaDropdownProperties & {
  children?: ReactNode
} & ClassListProperties

export const Dropdown: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownProperties> & RefAttributes<VanillaDropdown>
> = /* @__PURE__ */ build<VanillaDropdown, DropdownProperties>(
  VanillaDropdown,
  'VanillaHorizonDropdown'
)

export * from './avatar.js'
export * from './button.js'
export * from './icon.js'
export * from './list-item.js'
export * from './list.js'
export * from './text-value.js'
