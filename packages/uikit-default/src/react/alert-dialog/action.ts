import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogAction as VanillaAlertDialogAction,
  type AlertDialogActionProperties as VanillaAlertDialogActionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogAction as VanillaAlertDialogAction } from '@three-flatland/uikit-default'

export type AlertDialogActionProperties = VanillaAlertDialogActionProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogAction: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogActionProperties> & RefAttributes<VanillaAlertDialogAction>
> = /* @__PURE__ */ build<VanillaAlertDialogAction, AlertDialogActionProperties>(
  VanillaAlertDialogAction,
  'VanillaDefaultAlertDialogAction'
)
