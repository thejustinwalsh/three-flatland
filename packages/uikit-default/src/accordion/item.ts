import { object, string } from 'zod'
import type { z } from 'zod'
import { baseOutPropertyShape, createInPropertiesSchema, defineSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  Container,
  type InProperties,
  type RenderContext,
} from '@three-flatland/uikit'
import { colors, componentDefaults } from '../theme.js'
export const AccordionItemOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  object({
    ...baseOutPropertyShape,
    value: string().optional(),
  }).strict()
)

export const AccordionItemPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(AccordionItemOutPropertiesSchema)
)

export type AccordionItemOutProperties = BaseOutProperties &
  z.output<typeof AccordionItemOutPropertiesSchema>

export type AccordionItemProperties = z.input<typeof AccordionItemPropertiesSchema>

export class AccordionItem extends Container<AccordionItemOutProperties> {
  constructor(
    inputProperties?: InProperties<AccordionItemOutProperties>,
    initialClasses?: (string | InProperties<BaseOutProperties>)[],
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<AccordionItemOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        // AccordionTrigger owns activation (role: 'button' + onActivate) so pointer/keyboard/AT/XR
        // all toggle through one handler. The item itself is a non-interactive layout wrapper — it
        // must NOT also handle 'click', or the bubbled pointer click would re-toggle via this
        // component's own activate() right after the trigger's already ran (open-then-close flicker).
        flexDirection: 'column',
        borderBottomWidth: 1,
        ...config?.defaultOverrides,
      },
    })
  }
}
