import type { z } from 'zod'
import {
  baseOutPropertiesSchema,
  createInPropertiesSchema,
  defineSchema,
} from '@three-flatland/uikit'
import {
  Container,
  type InProperties,
  type BaseOutProperties,
  type RenderContext,
} from '@three-flatland/uikit'
import { colors, componentDefaults } from '../theme.js'
export const AlertDialogHeaderOutPropertiesSchema = baseOutPropertiesSchema

export const AlertDialogHeaderPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(AlertDialogHeaderOutPropertiesSchema)
)

export type AlertDialogHeaderOutProperties = BaseOutProperties &
  z.output<typeof AlertDialogHeaderOutPropertiesSchema>

export type AlertDialogHeaderProperties = z.input<typeof AlertDialogHeaderPropertiesSchema>

export class AlertDialogHeader extends Container<AlertDialogHeaderOutProperties> {
  constructor(
    inputProperties?: AlertDialogHeaderProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<AlertDialogHeaderOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        flexDirection: 'column',
        gap: 6,
        ...config?.defaultOverrides,
      },
    })
  }
}
