import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownTextValue as VanillaDropdownTextValue,
  type DropdownTextValueProperties as VanillaDropdownTextValueProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownTextValue as VanillaDropdownTextValue } from '@three-flatland/uikit-horizon'

export type DropdownTextValueProperties = VanillaDropdownTextValueProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownTextValue: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownTextValueProperties> & RefAttributes<VanillaDropdownTextValue>
> = /* @__PURE__ */ build<VanillaDropdownTextValue, DropdownTextValueProperties>(
  VanillaDropdownTextValue,
  'VanillaHorizonDropdownTextValue'
)
