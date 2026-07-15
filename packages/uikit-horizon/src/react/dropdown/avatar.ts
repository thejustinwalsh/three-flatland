import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DropdownAvatar as VanillaDropdownAvatar,
  type DropdownAvatarProperties as VanillaDropdownAvatarProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DropdownAvatar as VanillaDropdownAvatar } from '@three-flatland/uikit-horizon'

export type DropdownAvatarProperties = VanillaDropdownAvatarProperties & {
  children?: ReactNode
} & ClassListProperties

export const DropdownAvatar: ForwardRefExoticComponent<
  PropsWithoutRef<DropdownAvatarProperties> & RefAttributes<VanillaDropdownAvatar>
> = /* @__PURE__ */ build<VanillaDropdownAvatar, DropdownAvatarProperties>(
  VanillaDropdownAvatar,
  'VanillaHorizonDropdownAvatar'
)
