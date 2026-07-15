import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  InputField as VanillaInputField,
  type InputFieldProperties as VanillaInputFieldProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { InputField as VanillaInputField } from '@three-flatland/uikit-horizon'

export type InputFieldProperties = VanillaInputFieldProperties & {
  children?: ReactNode
} & ClassListProperties

export const InputField: ForwardRefExoticComponent<
  PropsWithoutRef<InputFieldProperties> & RefAttributes<VanillaInputField>
> = /* @__PURE__ */ build<VanillaInputField, InputFieldProperties>(
  VanillaInputField,
  'VanillaHorizonInputField'
)
