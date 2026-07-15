import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogHeader as VanillaDialogHeader,
  type DialogHeaderProperties as VanillaDialogHeaderProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogHeader as VanillaDialogHeader } from '@three-flatland/uikit-default'

export type DialogHeaderProperties = VanillaDialogHeaderProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogHeader: ForwardRefExoticComponent<
  PropsWithoutRef<DialogHeaderProperties> & RefAttributes<VanillaDialogHeader>
> = /* @__PURE__ */ build<VanillaDialogHeader, DialogHeaderProperties>(
  VanillaDialogHeader,
  'VanillaDefaultDialogHeader'
)
