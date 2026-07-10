import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownButton as VanillaDropdownButton,
  type DropdownButtonProperties as VanillaDropdownButtonProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownButton as VanillaDropdownButton } from '@three-flatland/uikit-horizon'

export type DropdownButtonProperties = VanillaDropdownButtonProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownButton: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownButtonProperties> & RefAttributes<VanillaDropdownButton>
> = /* @__PURE__ */ build<VanillaDropdownButton, DropdownButtonProperties>(
  VanillaDropdownButton,
  'VanillaHorizonDropdownButton'
)
