import { object, string } from 'zod'
import type { z } from 'zod'
import { baseOutPropertyShape, createInPropertiesSchema, defineSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  componentDefaults,
  Container,
  type InProperties,
  type RenderContext,
  Text,
  type TextOutProperties,
  type WithSignal,
} from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Dropdown } from './index.js'
import { PhoneForwarded } from '@three-flatland/uikit-lucide'
export const DropdownTextValueOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  object({
    ...baseOutPropertyShape,
    placeholder: string().optional(),
  }).strict()
)

export const DropdownTextValuePropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(DropdownTextValueOutPropertiesSchema)
)

export type DropdownTextValueOutProperties = Omit<TextOutProperties, 'text'> &
  z.output<typeof DropdownTextValueOutPropertiesSchema>

export type DropdownTextValueProperties = z.input<typeof DropdownTextValuePropertiesSchema>

export class DropdownTextValue extends Text<DropdownTextValueOutProperties & { text?: string }> {
  constructor(
    inputProperties?: InProperties<DropdownTextValueOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<DropdownTextValueOutProperties>
      defaults?: WithSignal<DropdownTextValueOutProperties>
    }
  ) {
    const text = computed(() => {
      const dropdown = this.parentContainer.value
      if (dropdown instanceof Dropdown && dropdown.currentSignal.value != null) {
        return dropdown.currentSignal.value
      }
      return this.properties.value.placeholder
    })
    super(inputProperties, initialClasses, {
      ...config,
      defaultOverrides: {
        text,
        ...config?.defaultOverrides,
      },
    })
  }
}
