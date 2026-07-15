import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogTitle as VanillaAlertDialogTitle,
  type AlertDialogTitleProperties as VanillaAlertDialogTitleProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogTitle as VanillaAlertDialogTitle } from '@three-flatland/uikit-default'

export type AlertDialogTitleProperties = VanillaAlertDialogTitleProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogTitle: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogTitleProperties> & RefAttributes<VanillaAlertDialogTitle>
> = /* @__PURE__ */ build<VanillaAlertDialogTitle, AlertDialogTitleProperties>(
  VanillaAlertDialogTitle,
  'VanillaDefaultAlertDialogTitle'
)
