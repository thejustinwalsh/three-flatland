import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ButtonLabelSubtext as VanillaButtonLabelSubtext,
  type ButtonLabelSubtextProperties as VanillaButtonLabelSubtextProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ButtonLabelSubtext as VanillaButtonLabelSubtext } from '@three-flatland/uikit-horizon'

export type ButtonLabelSubtextProperties = VanillaButtonLabelSubtextProperties & {
  children?: ReactNode
} & ClassListProperties

export const ButtonLabelSubtext: ForwardRefExoticComponent<
  PropsWithoutRef<ButtonLabelSubtextProperties> & RefAttributes<VanillaButtonLabelSubtext>
> = /* @__PURE__ */ build<VanillaButtonLabelSubtext, ButtonLabelSubtextProperties>(
  VanillaButtonLabelSubtext,
  'VanillaHorizonButtonLabelSubtext'
)
