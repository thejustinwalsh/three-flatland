import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ProgressBarStepper as VanillaProgressBarStepper,
  type ProgressBarStepperProperties as VanillaProgressBarStepperProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ProgressBarStepper as VanillaProgressBarStepper } from '@three-flatland/uikit-horizon'

export type ProgressBarStepperProperties = VanillaProgressBarStepperProperties & {
  children?: ReactNode
} & ClassListProperties

export const ProgressBarStepper: ForwardRefExoticComponent<
  PropsWithoutRef<ProgressBarStepperProperties> & RefAttributes<VanillaProgressBarStepper>
> = /* @__PURE__ */ build<VanillaProgressBarStepper, ProgressBarStepperProperties>(
  VanillaProgressBarStepper,
  'VanillaHorizonProgressBarStepper'
)
