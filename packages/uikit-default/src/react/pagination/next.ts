import type {
  ForwardRefExoticComponent,
  PropsWithoutRef,
  ReactNode,
  RefAttributes,
} from 'react'
import {
  PaginationNext as VanillaPaginationNext,
  type PaginationNextProperties as VanillaPaginationNextProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationNext as VanillaPaginationNext } from '@three-flatland/uikit-default'

export type PaginationNextProperties = VanillaPaginationNextProperties & ClassListProperties

export const PaginationNext: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationNextProperties> & RefAttributes<VanillaPaginationNext>
> = /* @__PURE__ */ build<VanillaPaginationNext, PaginationNextProperties>(
  VanillaPaginationNext,
  'VanillaDefaultPaginationNext'
)
