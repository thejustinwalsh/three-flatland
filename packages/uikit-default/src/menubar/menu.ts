import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  Container,
  type InProperties,
  type BaseOutProperties,
  type RenderContext,
  type ContainerProperties,
} from '@three-flatland/uikit'
import { colors, componentDefaults } from '../theme.js'
export const MenubarMenuPropertiesSchema = ContainerPropertiesSchema

export type MenubarMenuProperties = z.input<typeof MenubarMenuPropertiesSchema>

export class MenubarMenu extends Container {
  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
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
        ...config?.defaultOverrides,
      },
    })
  }
}
