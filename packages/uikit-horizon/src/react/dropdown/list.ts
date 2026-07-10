import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownList as VanillaDropdownList,
  type DropdownListProperties as VanillaDropdownListProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownList as VanillaDropdownList } from '@three-flatland/uikit-horizon'

export type DropdownListProperties = VanillaDropdownListProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownList: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownListProperties> & RefAttributes<VanillaDropdownList>
> = /* @__PURE__ */ build<VanillaDropdownList, DropdownListProperties>(
  VanillaDropdownList,
  'VanillaHorizonDropdownList'
)
