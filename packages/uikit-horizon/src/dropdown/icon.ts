import type { z } from 'zod'
import {
  baseOutPropertiesSchema,
  createInPropertiesSchema,
  defineSchema,
} from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  componentDefaults,
  Container,
  type InProperties,
  type RenderContext,
  type WithSignal,
} from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Dropdown } from './index.js'
export const DropdownIconOutPropertiesSchema = baseOutPropertiesSchema

export const DropdownIconPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(DropdownIconOutPropertiesSchema)
)

export type DropdownIconOutProperties = BaseOutProperties &
  z.output<typeof DropdownIconOutPropertiesSchema>

export type DropdownIconProperties = z.input<typeof DropdownIconPropertiesSchema>

export class DropdownIcon extends Container<BaseOutProperties> {
  constructor(
    inputProperties?: InProperties<DropdownIconOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<DropdownIconOutProperties>
      defaults?: WithSignal<DropdownIconOutProperties>
    }
  ) {
    const size = computed(() => {
      const dropdown = this.parentContainer.value
      if (!(dropdown instanceof Dropdown)) {
        return 24
      }
      const size = dropdown.properties.value.size ?? 'lg'
      if (size === 'lg') {
        return 24
      }
      return 16
    })
    super(inputProperties, initialClasses, {
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
