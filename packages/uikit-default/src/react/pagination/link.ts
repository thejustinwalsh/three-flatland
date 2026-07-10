import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  PaginationLink as VanillaPaginationLink,
  type PaginationLinkProperties as VanillaPaginationLinkProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { PaginationLink as VanillaPaginationLink } from '@three-flatland/uikit-default'

export type PaginationLinkProperties = VanillaPaginationLinkProperties & {
  children?: ReactNode
} & ClassListProperties

export const PaginationLink: ForwardRefExoticComponent<
  PropsWithoutRef<PaginationLinkProperties> & RefAttributes<VanillaPaginationLink>
> = /* @__PURE__ */ build<VanillaPaginationLink, PaginationLinkProperties>(
  VanillaPaginationLink,
  'VanillaDefaultPaginationLink'
)
