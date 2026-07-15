import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  Container,
  type InProperties,
  type RenderContext,
} from '@three-flatland/uikit'
import { colors, componentDefaults } from '../theme.js'
export const AlertIconPropertiesSchema = ContainerPropertiesSchema

export type AlertIconProperties = z.input<typeof AlertIconPropertiesSchema>

export class AlertIcon extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: AlertIconProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: { renderContext?: RenderContext; defaultOverrides?: InProperties<BaseOutProperties> }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        positionLeft: 16,
        positionTop: 16,
        positionType: 'absolute',
        ...config?.defaultOverrides,
      },
    })
  }
}
