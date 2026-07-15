import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  PaginationItem as VanillaPaginationItem,
  type PaginationItemProperties as VanillaPaginationItemProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationItem as VanillaPaginationItem } from '@three-flatland/uikit-default'

export type PaginationItemProperties = VanillaPaginationItemProperties & {
  children?: ReactNode
} & ClassListProperties

export const PaginationItem: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationItemProperties> & RefAttributes<VanillaPaginationItem>
> = /* @__PURE__ */ build<VanillaPaginationItem, PaginationItemProperties>(
  VanillaPaginationItem,
  'VanillaDefaultPaginationItem'
)
