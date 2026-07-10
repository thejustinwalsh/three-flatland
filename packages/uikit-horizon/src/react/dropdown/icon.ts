import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownIcon as VanillaDropdownIcon,
  type DropdownIconProperties as VanillaDropdownIconProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownIcon as VanillaDropdownIcon } from '@three-flatland/uikit-horizon'

export type DropdownIconProperties = VanillaDropdownIconProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownIcon: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownIconProperties> & RefAttributes<VanillaDropdownIcon>
> = /* @__PURE__ */ build<VanillaDropdownIcon, DropdownIconProperties>(
  VanillaDropdownIcon,
  'VanillaHorizonDropdownIcon'
)
