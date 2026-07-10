import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownListItem as VanillaDropdownListItem,
  type DropdownListItemProperties as VanillaDropdownListItemProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownListItem as VanillaDropdownListItem } from '@three-flatland/uikit-horizon'

export type DropdownListItemProperties = VanillaDropdownListItemProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownListItem: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownListItemProperties> & RefAttributes<VanillaDropdownListItem>
> = /* @__PURE__ */ build<VanillaDropdownListItem, DropdownListItemProperties>(
  VanillaDropdownListItem,
  'VanillaHorizonDropdownListItem'
)
