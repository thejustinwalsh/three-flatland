import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogContent as VanillaDialogContent,
  type DialogContentProperties as VanillaDialogContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogContent as VanillaDialogContent } from '@three-flatland/uikit-default'

export type DialogContentProperties = VanillaDialogContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogContent: ForwardRefExoticComponent<
  PropsWithoutRef<DialogContentProperties> & RefAttributes<VanillaDialogContent>
> = /* @__PURE__ */ build<VanillaDialogContent, DialogContentProperties>(
  VanillaDialogContent,
  'VanillaDefaultDialogContent'
)
