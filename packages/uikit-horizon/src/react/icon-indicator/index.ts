import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  IconIndicator as VanillaIconIndicator,
  type IconIndicatorProperties as VanillaIconIndicatorProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { IconIndicator as VanillaIconIndicator } from '@three-flatland/uikit-horizon'

export type IconIndicatorProperties = VanillaIconIndicatorProperties & ClassListProperties

export const IconIndicator: ForwardRefExoticComponent<
  PropsWithoutRef<IconIndicatorProperties> & RefAttributes<VanillaIconIndicator>
> = /* @__PURE__ */ build<VanillaIconIndicator, IconIndicatorProperties>(
  VanillaIconIndicator,
  'VanillaHorizonIconIndicator'
)
