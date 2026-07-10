import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  Checkbox as VanillaCheckbox,
  type CheckboxProperties as VanillaCheckboxProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Checkbox as VanillaCheckbox } from '@three-flatland/uikit-default'

export type CheckboxProperties = VanillaCheckboxProperties & ClassListProperties

export const Checkbox: ForwardRefExoticComponent<
  PropsWithoutRef<CheckboxProperties> & RefAttributes<VanillaCheckbox>
> = /* @__PURE__ */ build<VanillaCheckbox, CheckboxProperties>(
  VanillaCheckbox,
  'VanillaDefaultCheckbox'
)
