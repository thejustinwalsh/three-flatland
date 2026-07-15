import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialog as VanillaAlertDialog,
  type AlertDialogProperties as VanillaAlertDialogProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialog as VanillaAlertDialog } from '@three-flatland/uikit-default'

export type AlertDialogProperties = VanillaAlertDialogProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialog: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogProperties> & RefAttributes<VanillaAlertDialog>
> = /* @__PURE__ */ build<VanillaAlertDialog, AlertDialogProperties>(
  VanillaAlertDialog,
  'VanillaDefaultAlertDialog'
)

export * from './action.js'
export * from './cancel.js'
export * from './content.js'
export * from './description.js'
export * from './footer.js'
export * from './header.js'
export * from './title.js'
export * from './trigger.js'
