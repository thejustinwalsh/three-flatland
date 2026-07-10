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
import { theme } from '../theme.js'
export const ButtonLabelSubtextPropertiesSchema = ContainerPropertiesSchema

export type ButtonLabelSubtextProperties = z.input<typeof ButtonLabelSubtextPropertiesSchema>

export class ButtonLabelSubtext extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<BaseOutProperties>
      defaults?: WithSignal<BaseOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        fontSize: 12,
        lineHeight: '16px',
        color: computed(() => {
          const button = this.parentContainer.value?.parentContainer.value
          if (!(button instanceof Button)) {
            return undefined
          }
          if (button.properties.value.disabled === true) {
            return theme.component.button[button.properties.value.variant ?? 'primary'].subtext
              .disabled.value
          }
          return theme.component.button[button.properties.value.variant ?? 'primary'].subtext
            .default.value
        }),
        ...config?.defaultOverrides,
      },
    })
  }
}
