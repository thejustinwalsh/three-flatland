import { object, string } from 'zod'
import type { z } from 'zod'
import { baseOutPropertyShape, createInPropertiesSchema, defineSchema } from '@three-flatland/uikit'
import {
  Container,
  type InProperties,
  type BaseOutProperties,
  type RenderContext,
  searchFor,
} from '@three-flatland/uikit'
import { computed } from '@preact/signals-core'
import { Tabs } from './index.js'
import { colors, componentDefaults } from '../theme.js'
export const TabsContentOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  object({
    ...baseOutPropertyShape,
    value: string().optional(),
  }).strict()
)

export const TabsContentPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(TabsContentOutPropertiesSchema)
)

export type TabsContentOutProperties = BaseOutProperties &
  z.output<typeof TabsContentOutPropertiesSchema>

export type TabsContentProperties = z.input<typeof TabsContentPropertiesSchema>

export class TabsContent extends Container<TabsContentOutProperties> {
  constructor(
    inputProperties?: TabsContentProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<TabsContentOutProperties>
    }
  ) {
    const isVisible = computed(() => {
      const tabs = searchFor(this, Tabs, 2)
      return this.properties.value.value === tabs?.currentSignal.value
    })
    super(inputProperties, initialClasses, {
      defaults: componentDefaults,
      ...config,
      defaultOverrides: {
        '*': {
          borderColor: colors.border,
        },
        marginTop: 8,
        // shadcn's TabsContent is a block-level div: children stack vertically and
        // fill its width. Yoga's web default is flexDirection row, which makes the
        // content (e.g. a Card) shrink-to-fit instead — the content box then changes
        // width per tab based on measured text. Upstream has the same latent behavior
        // but its MSDF Inter metrics happen to fill the available width, masking it.
        flexDirection: 'column',
        display: computed(() => (isVisible.value ? 'flex' : 'none')),
        ...config?.defaultOverrides,
      },
    })
  }
}
