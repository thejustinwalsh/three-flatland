import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogDescription as VanillaAlertDialogDescription,
  type AlertDialogDescriptionProperties as VanillaAlertDialogDescriptionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogDescription as VanillaAlertDialogDescription } from '@three-flatland/uikit-default'

export type AlertDialogDescriptionProperties = VanillaAlertDialogDescriptionProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogDescription: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogDescriptionProperties> & RefAttributes<VanillaAlertDialogDescription>
> = /* @__PURE__ */ build<VanillaAlertDialogDescription, AlertDialogDescriptionProperties>(
  VanillaAlertDialogDescription,
  'VanillaDefaultAlertDialogDescription'
)
