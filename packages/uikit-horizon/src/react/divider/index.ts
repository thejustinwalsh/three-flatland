import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Divider as VanillaDivider,
  type DividerProperties as VanillaDividerProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Divider as VanillaDivider } from '@three-flatland/uikit-horizon'

export type DividerProperties = VanillaDividerProperties & {
  children?: ReactNode
} & ClassListProperties

export const Divider: ForwardRefExoticComponent<
  PropsWithoutRef<DividerProperties> & RefAttributes<VanillaDivider>
> = /* @__PURE__ */ build<VanillaDivider, DividerProperties>(
  VanillaDivider,
  'VanillaHorizonDivider'
)
