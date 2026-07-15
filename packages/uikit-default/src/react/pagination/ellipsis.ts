import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  PaginationEllipsis as VanillaPaginationEllipsis,
  type PaginationEllipsisProperties as VanillaPaginationEllipsisProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationEllipsis as VanillaPaginationEllipsis } from '@three-flatland/uikit-default'

export type PaginationEllipsisProperties = VanillaPaginationEllipsisProperties & ClassListProperties

export const PaginationEllipsis: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationEllipsisProperties> & RefAttributes<VanillaPaginationEllipsis>
> = /* @__PURE__ */ build<VanillaPaginationEllipsis, PaginationEllipsisProperties>(
  VanillaPaginationEllipsis,
  'VanillaDefaultPaginationEllipsis'
)
