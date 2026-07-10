import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogContent as VanillaAlertDialogContent,
  type AlertDialogContentProperties as VanillaAlertDialogContentProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogContent as VanillaAlertDialogContent } from '@three-flatland/uikit-default'

export type AlertDialogContentProperties = VanillaAlertDialogContentProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogContent: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogContentProperties> & RefAttributes<VanillaAlertDialogContent>
> = /* @__PURE__ */ build<VanillaAlertDialogContent, AlertDialogContentProperties>(
  VanillaAlertDialogContent,
  'VanillaDefaultAlertDialogContent'
)
