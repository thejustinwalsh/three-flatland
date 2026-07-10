import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  Switch as VanillaSwitch,
  type SwitchProperties as VanillaSwitchProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Switch as VanillaSwitch } from '@three-flatland/uikit-default'

export type SwitchProperties = VanillaSwitchProperties & ClassListProperties

export const Switch: ForwardRefExoticComponent<
  PropsWithoutRef<SwitchProperties> & RefAttributes<VanillaSwitch>
> = /* @__PURE__ */ build<VanillaSwitch, SwitchProperties>(VanillaSwitch, 'VanillaDefaultSwitch')
