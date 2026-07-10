import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  Container,
  type ContainerProperties,
  type InProperties,
  type RenderContext,
} from '@three-flatland/uikit'
import { signal } from '@preact/signals-core'
import { colors, componentDefaults } from '../theme.js'
export const AccordionPropertiesSchema = ContainerPropertiesSchema

export type AccordionProperties = z.input<typeof AccordionPropertiesSchema>

export class Accordion extends Container {
  readonly openItemValue = signal<string | undefined>(undefined)

  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
    initialClasses?: (string | InProperties<BaseOutProperties>)[],
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<BaseOutProperties>
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
        ...config?.defaultOverrides,
      },
    })
  }
}

export * from './item.js'
export * from './trigger.js'
export * from './trigger-icon.js'
export * from './content.js'
