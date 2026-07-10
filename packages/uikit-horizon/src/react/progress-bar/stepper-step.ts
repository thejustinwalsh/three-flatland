import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  ProgressBarStepperStep as VanillaProgressBarStepperStep,
  type ProgressBarStepperStepProperties as VanillaProgressBarStepperStepProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ProgressBarStepperStep as VanillaProgressBarStepperStep } from '@three-flatland/uikit-horizon'

export type ProgressBarStepperStepProperties = VanillaProgressBarStepperStepProperties &
  ClassListProperties

export const ProgressBarStepperStep: ForwardRefExoticComponent<
  PropsWithoutRef<ProgressBarStepperStepProperties> & RefAttributes<VanillaProgressBarStepperStep>
> = /* @__PURE__ */ build<VanillaProgressBarStepperStep, ProgressBarStepperStepProperties>(
  VanillaProgressBarStepperStep,
  'VanillaHorizonProgressBarStepperStep'
)
