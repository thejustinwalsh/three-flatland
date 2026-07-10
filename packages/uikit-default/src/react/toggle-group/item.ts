import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ToggleGroupItem as VanillaToggleGroupItem,
  type ToggleGroupItemProperties as VanillaToggleGroupItemProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ToggleGroupItem as VanillaToggleGroupItem } from '@three-flatland/uikit-default'

export type ToggleGroupItemProperties = VanillaToggleGroupItemProperties & {
  children?: ReactNode
} & ClassListProperties

export const ToggleGroupItem: ForwardRefExoticComponent<
  PropsWithoutRef<ToggleGroupItemProperties> & RefAttributes<VanillaToggleGroupItem>
> = /* @__PURE__ */ build<VanillaToggleGroupItem, ToggleGroupItemProperties>(
  VanillaToggleGroupItem,
  'VanillaDefaultToggleGroupItem'
)
