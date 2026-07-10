import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  ProgressBar as VanillaProgressBar,
  type ProgressBarProperties as VanillaProgressBarProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ProgressBar as VanillaProgressBar } from '@three-flatland/uikit-horizon'

export type ProgressBarProperties = VanillaProgressBarProperties & ClassListProperties

export const ProgressBar: ForwardRefExoticComponent<
  PropsWithoutRef<ProgressBarProperties> & RefAttributes<VanillaProgressBar>
> = /* @__PURE__ */ build<VanillaProgressBar, ProgressBarProperties>(
  VanillaProgressBar,
  'VanillaHorizonProgressBar'
)

export * from './stepper-step.js'
export * from './stepper.js'
