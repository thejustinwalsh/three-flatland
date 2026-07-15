import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  RadioGroup as VanillaRadioGroup,
  type RadioGroupProperties as VanillaRadioGroupProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { RadioGroup as VanillaRadioGroup } from '@three-flatland/uikit-default'

export type RadioGroupProperties = VanillaRadioGroupProperties & {
  children?: ReactNode
} & ClassListProperties

export const RadioGroup: ForwardRefExoticComponent<
  PropsWithoutRef<RadioGroupProperties> & RefAttributes<VanillaRadioGroup>
> = /* @__PURE__ */ build<VanillaRadioGroup, RadioGroupProperties>(
  VanillaRadioGroup,
  'VanillaDefaultRadioGroup'
)

export * from './item.js'
