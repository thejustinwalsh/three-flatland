import { boolean, object } from 'zod'
import type { z } from 'zod'
import { baseOutPropertyShape, createInPropertiesSchema, defineSchema } from '@three-flatland/uikit'
import { type BaseOutProperties, Container, type InProperties } from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { colors, componentDefaults } from '../theme.js'
export const LabelOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  object({
    ...baseOutPropertyShape,
    disabled: boolean().optional(),
  }).strict()
)

export const LabelPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(LabelOutPropertiesSchema)
)

export type LabelOutProperties = BaseOutProperties & z.output<typeof LabelOutPropertiesSchema>

export type LabelProperties = z.input<typeof LabelPropertiesSchema>

export class Label extends Container<LabelOutProperties> {
  constructor(
    inputProperties?: InProperties<LabelOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: any
      defaultOverrides?: InProperties<LabelOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        fontWeight: 'medium',
        fontSize: 14,
        lineHeight: '100%',
        opacity: computed(() => (this.properties.value.disabled ? 0.7 : undefined)),
        ...config?.defaultOverrides,
      },
    })
  }
}
