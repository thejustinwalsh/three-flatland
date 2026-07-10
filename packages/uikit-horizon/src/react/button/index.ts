import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Button as VanillaButton,
  type ButtonProperties as VanillaButtonProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Button as VanillaButton } from '@three-flatland/uikit-horizon'

export type ButtonProperties = VanillaButtonProperties & {
  children?: ReactNode
} & ClassListProperties

export const Button: ForwardRefExoticComponent<
  PropsWithoutRef<ButtonProperties> & RefAttributes<VanillaButton>
> = /* @__PURE__ */ build<VanillaButton, ButtonProperties>(VanillaButton, 'VanillaHorizonButton')

export * from './icon.js'
export * from './label-subtext.js'
export * from './label.js'
