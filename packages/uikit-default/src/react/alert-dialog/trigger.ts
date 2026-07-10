import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogTrigger as VanillaAlertDialogTrigger,
  type AlertDialogTriggerProperties as VanillaAlertDialogTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogTrigger as VanillaAlertDialogTrigger } from '@three-flatland/uikit-default'

export type AlertDialogTriggerProperties = VanillaAlertDialogTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogTriggerProperties> & RefAttributes<VanillaAlertDialogTrigger>
> = /* @__PURE__ */ build<VanillaAlertDialogTrigger, AlertDialogTriggerProperties>(
  VanillaAlertDialogTrigger,
  'VanillaDefaultAlertDialogTrigger'
)
