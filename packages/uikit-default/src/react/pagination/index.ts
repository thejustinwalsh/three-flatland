import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Pagination as VanillaPagination,
  type PaginationProperties as VanillaPaginationProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Pagination as VanillaPagination } from '@three-flatland/uikit-default'

export type PaginationProperties = VanillaPaginationProperties & {
  children?: ReactNode
} & ClassListProperties

export const Pagination: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationProperties> & RefAttributes<VanillaPagination>
> = /* @__PURE__ */ build<VanillaPagination, PaginationProperties>(
  VanillaPagination,
  'VanillaDefaultPagination'
)

export * from './content.js'
export * from './ellipsis.js'
export * from './item.js'
export * from './link.js'
export * from './next.js'
export * from './previous.js'
