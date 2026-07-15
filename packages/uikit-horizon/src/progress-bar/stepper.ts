import type { z } from 'zod'
import {
  baseOutPropertiesSchema,
  createInPropertiesSchema,
  defineSchema,
} from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  Container,
  type InProperties,
  type RenderContext,
} from '@three-flatland/uikit'
export const ProgressBarStepperOutPropertiesSchema = baseOutPropertiesSchema

export const ProgressBarStepperPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(ProgressBarStepperOutPropertiesSchema)
)

export type ProgressBarStepperOutProperties = BaseOutProperties &
  z.output<typeof ProgressBarStepperOutPropertiesSchema>

export type ProgressBarStepperProperties = z.input<typeof ProgressBarStepperPropertiesSchema>

export class ProgressBarStepper extends Container<ProgressBarStepperOutProperties> {
  constructor(
    inputProperties?: InProperties<ProgressBarStepperOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<ProgressBarStepperOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      ...config,
      defaultOverrides: {
        flexDirection: 'row',
        height: 12,
        gap: 8,
        ...config?.defaultOverrides,
      },
    })
  }
}
