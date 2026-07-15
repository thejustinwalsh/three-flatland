import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  componentDefaults,
  Container,
  type ContainerProperties,
  type InProperties,
  type RenderContext,
  type WithSignal,
} from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Button } from './index.js'
export const ButtonIconPropertiesSchema = ContainerPropertiesSchema

export type ButtonIconProperties = z.input<typeof ButtonIconPropertiesSchema>

export class ButtonIcon extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<BaseOutProperties>
      defaults?: WithSignal<BaseOutProperties>
    }
  ) {
    const size = computed(() => {
      const btn = this.parentContainer.value
      if (!(btn instanceof Button)) {
        return 24
      }
      const size = btn.properties.value.size ?? 'lg'
      if (size === 'lg') {
        return 24
      }
      return 16
    })
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          width: size,
          height: size,
        },
        ...config?.defaultOverrides,
      },
    })
  }
}
