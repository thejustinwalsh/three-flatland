import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  PaginationContent as VanillaPaginationContent,
  type PaginationContentProperties as VanillaPaginationContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationContent as VanillaPaginationContent } from '@three-flatland/uikit-default'

export type PaginationContentProperties = VanillaPaginationContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const PaginationContent: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationContentProperties> & RefAttributes<VanillaPaginationContent>
> = /* @__PURE__ */ build<VanillaPaginationContent, PaginationContentProperties>(
  VanillaPaginationContent,
  'VanillaDefaultPaginationContent'
)
