import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Progress as VanillaProgress,
  type ProgressProperties as VanillaProgressProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Progress as VanillaProgress } from '@three-flatland/uikit-default'

export type ProgressProperties = VanillaProgressProperties & ClassListProperties

export const Progress: ForwardRefExoticComponent<
  PropsWithoutRef<ProgressProperties> & RefAttributes<VanillaProgress>
> = /* @__PURE__ */ build<VanillaProgress, ProgressProperties>(
  VanillaProgress,
  'VanillaDefaultProgress'
)
