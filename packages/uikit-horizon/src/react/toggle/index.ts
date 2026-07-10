import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Toggle as VanillaToggle,
  type ToggleProperties as VanillaToggleProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Toggle as VanillaToggle } from '@three-flatland/uikit-horizon'

export type ToggleProperties = VanillaToggleProperties & ClassListProperties

export const Toggle: ForwardRefExoticComponent<
  PropsWithoutRef<ToggleProperties> & RefAttributes<VanillaToggle>
> = /* @__PURE__ */ build<VanillaToggle, ToggleProperties>(VanillaToggle, 'VanillaHorizonToggle')
