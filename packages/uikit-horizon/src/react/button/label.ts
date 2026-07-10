import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ButtonLabel as VanillaButtonLabel,
  type ButtonLabelProperties as VanillaButtonLabelProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ButtonLabel as VanillaButtonLabel } from '@three-flatland/uikit-horizon'

export type ButtonLabelProperties = VanillaButtonLabelProperties & {
  children?: ReactNode
} & ClassListProperties

export const ButtonLabel: ForwardRefExoticComponent<
  PropsWithoutRef<ButtonLabelProperties> & RefAttributes<VanillaButtonLabel>
> = /* @__PURE__ */ build<VanillaButtonLabel, ButtonLabelProperties>(
  VanillaButtonLabel,
  'VanillaHorizonButtonLabel'
)
