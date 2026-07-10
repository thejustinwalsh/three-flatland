import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  PaginationPrevious as VanillaPaginationPrevious,
  type PaginationPreviousProperties as VanillaPaginationPreviousProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationPrevious as VanillaPaginationPrevious } from '@three-flatland/uikit-default'

export type PaginationPreviousProperties = VanillaPaginationPreviousProperties & ClassListProperties

export const PaginationPrevious: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationPreviousProperties> & RefAttributes<VanillaPaginationPrevious>
> = /* @__PURE__ */ build<VanillaPaginationPrevious, PaginationPreviousProperties>(
  VanillaPaginationPrevious,
  'VanillaDefaultPaginationPrevious'
)
