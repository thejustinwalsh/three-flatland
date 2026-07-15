import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  ToggleGroup as VanillaToggleGroup,
  type ToggleGroupProperties as VanillaToggleGroupProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { ToggleGroup as VanillaToggleGroup } from '@three-flatland/uikit-default'

export type ToggleGroupProperties = VanillaToggleGroupProperties & {
  children?: ReactNode
} & ClassListProperties

export const ToggleGroup: ForwardRefExoticComponent<
  PropsWithoutRef<ToggleGroupProperties> & RefAttributes<VanillaToggleGroup>
> = /* @__PURE__ */ build<VanillaToggleGroup, ToggleGroupProperties>(
  VanillaToggleGroup,
  'VanillaDefaultToggleGroup'
)

export * from './item.js'
