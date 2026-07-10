import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  Avatar as VanillaAvatar,
  type AvatarProperties as VanillaAvatarProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Avatar as VanillaAvatar } from '@three-flatland/uikit-default'

export type AvatarProperties = VanillaAvatarProperties & ClassListProperties

export const Avatar: ForwardRefExoticComponent<
  PropsWithoutRef<AvatarProperties> & RefAttributes<VanillaAvatar>
> = /* @__PURE__ */ build<VanillaAvatar, AvatarProperties>(VanillaAvatar, 'VanillaDefaultAvatar')
