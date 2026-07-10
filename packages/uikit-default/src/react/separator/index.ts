import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Separator as VanillaSeparator,
  type SeparatorProperties as VanillaSeparatorProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Separator as VanillaSeparator } from '@three-flatland/uikit-default'

export type SeparatorProperties = VanillaSeparatorProperties & {
  children?: ReactNode
} & ClassListProperties

export const Separator: ForwardRefExoticComponent<
  PropsWithoutRef<SeparatorProperties> & RefAttributes<VanillaSeparator>
> = /* @__PURE__ */ build<VanillaSeparator, SeparatorProperties>(
  VanillaSeparator,
  'VanillaDefaultSeparator'
)
