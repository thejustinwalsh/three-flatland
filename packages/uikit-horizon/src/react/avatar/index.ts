import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  Avatar as VanillaAvatar,
  type AvatarProperties as VanillaAvatarProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Avatar as VanillaAvatar } from '@three-flatland/uikit-horizon'

export type AvatarProperties = VanillaAvatarProperties & ClassListProperties

export const Avatar: ForwardRefExoticComponent<
  PropsWithoutRef<AvatarProperties> & RefAttributes<VanillaAvatar>
> = /* @__PURE__ */ build<VanillaAvatar, AvatarProperties>(VanillaAvatar, 'VanillaHorizonAvatar')
