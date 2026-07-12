import type { z } from 'zod'
import { ContainerPropertiesSchema } from '@three-flatland/uikit'
import {
  type BaseOutProperties,
  Container,
  type InProperties,
  type RenderContext,
  searchFor,
} from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Accordion } from './index.js'
import { AccordionItem } from './item.js'
import { colors, componentDefaults } from '../theme.js'
export const AccordionTriggerPropertiesSchema = ContainerPropertiesSchema

export type AccordionTriggerProperties = z.input<typeof AccordionTriggerPropertiesSchema>

export class AccordionTrigger extends Container {
  constructor(
    inputProperties?: InProperties<BaseOutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides: InProperties<BaseOutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        role: 'button',
        ariaExpanded: computed(() => {
          const item = searchFor(this, AccordionItem, 2)
          if (item == null) {
            return false
          }
          const accordion = searchFor(item, Accordion, 2)
          return item.properties.value.value === accordion?.openItemValue.value
        }),
        cursor: 'pointer',
        onActivate: () => {
          const item = searchFor(this, AccordionItem, 2)
          if (item == null) {
            return
          }
          const accordion = searchFor(item, Accordion, 2)
          if (accordion == null) {
            return
          }
          const ownValue = item.properties.peek().value
          const currentValue = accordion.openItemValue.peek()
          const isSelected = ownValue === currentValue
          accordion.openItemValue.value = isSelected ? undefined : ownValue
        },
        flexDirection: 'row',
        flexGrow: 1,
        flexShrink: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingBottom: 16,
        fontSize: 14,
        lineHeight: '20px',
        fontWeight: 'medium',
        ...config?.defaultOverrides,
      },
    })
  }
}
