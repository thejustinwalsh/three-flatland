import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  Container,
  type InProperties,
  type BaseOutProperties,
  type RenderContext,
} from '@three-flatland/uikit'
import { colors, componentDefaults } from '../theme.js'
export const PaginationContentPropertiesSchema = ContainerPropertiesSchema

export type PaginationContentProperties = z.input<typeof PaginationContentPropertiesSchema>

export class PaginationContent extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: PaginationContentProperties,
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        ...config?.defaultOverrides,
      },
    })
  }
}
