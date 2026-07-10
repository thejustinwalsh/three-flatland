import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogCancel as VanillaAlertDialogCancel,
  type AlertDialogCancelProperties as VanillaAlertDialogCancelProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogCancel as VanillaAlertDialogCancel } from '@three-flatland/uikit-default'

export type AlertDialogCancelProperties = VanillaAlertDialogCancelProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogCancel: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogCancelProperties> & RefAttributes<VanillaAlertDialogCancel>
> = /* @__PURE__ */ build<VanillaAlertDialogCancel, AlertDialogCancelProperties>(
  VanillaAlertDialogCancel,
  'VanillaDefaultAlertDialogCancel'
)
