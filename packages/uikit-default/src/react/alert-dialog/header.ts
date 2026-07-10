import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogHeader as VanillaAlertDialogHeader,
  type AlertDialogHeaderProperties as VanillaAlertDialogHeaderProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogHeader as VanillaAlertDialogHeader } from '@three-flatland/uikit-default'

export type AlertDialogHeaderProperties = VanillaAlertDialogHeaderProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogHeader: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogHeaderProperties> & RefAttributes<VanillaAlertDialogHeader>
> = /* @__PURE__ */ build<VanillaAlertDialogHeader, AlertDialogHeaderProperties>(
  VanillaAlertDialogHeader,
  'VanillaDefaultAlertDialogHeader'
)
