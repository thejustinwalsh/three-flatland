import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  RadioGroupItem as VanillaRadioGroupItem,
  type RadioGroupItemProperties as VanillaRadioGroupItemProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { RadioGroupItem as VanillaRadioGroupItem } from '@three-flatland/uikit-horizon'

export type RadioGroupItemProperties = VanillaRadioGroupItemProperties & {
  children?: ReactNode
} & ClassListProperties

export const RadioGroupItem: ForwardRefExoticComponent<
  PropsWithoutRef<RadioGroupItemProperties> & RefAttributes<VanillaRadioGroupItem>
> = /* @__PURE__ */ build<VanillaRadioGroupItem, RadioGroupItemProperties>(
  VanillaRadioGroupItem,
  'VanillaHorizonRadioGroupItem'
)
