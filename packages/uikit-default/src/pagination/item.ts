import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  Container,
  type InProperties,
  type BaseOutProperties,
  type WithSignal,
  type RenderContext,
} from '@three-flatland/uikit'
import { componentDefaults } from '../theme.js'
export const PaginationItemPropertiesSchema = ContainerPropertiesSchema

export type PaginationItemProperties = z.input<typeof PaginationItemPropertiesSchema>

export class PaginationItem extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<BaseOutProperties>
      defaults?: WithSignal<BaseOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, { defaults: componentDefaults, ...config })
  }
}
