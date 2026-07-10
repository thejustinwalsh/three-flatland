import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Skeleton as VanillaSkeleton,
  type SkeletonProperties as VanillaSkeletonProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Skeleton as VanillaSkeleton } from '@three-flatland/uikit-default'

export type SkeletonProperties = VanillaSkeletonProperties & {
  children?: ReactNode
} & ClassListProperties

export const Skeleton: ForwardRefExoticComponent<
  PropsWithoutRef<SkeletonProperties> & RefAttributes<VanillaSkeleton>
> = /* @__PURE__ */ build<VanillaSkeleton, SkeletonProperties>(
  VanillaSkeleton,
  'VanillaDefaultSkeleton'
)
