import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ButtonIcon as VanillaButtonIcon,
  type ButtonIconProperties as VanillaButtonIconProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ButtonIcon as VanillaButtonIcon } from '@three-flatland/uikit-horizon'

export type ButtonIconProperties = VanillaButtonIconProperties & {
  children?: ReactNode
} & ClassListProperties

export const ButtonIcon: ForwardRefExoticComponent<
  PropsWithoutRef<ButtonIconProperties> & RefAttributes<VanillaButtonIcon>
> = /* @__PURE__ */ build<VanillaButtonIcon, ButtonIconProperties>(
  VanillaButtonIcon,
  'VanillaHorizonButtonIcon'
)
