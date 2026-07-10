import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDialogFooter as VanillaAlertDialogFooter,
  type AlertDialogFooterProperties as VanillaAlertDialogFooterProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDialogFooter as VanillaAlertDialogFooter } from '@three-flatland/uikit-default'

export type AlertDialogFooterProperties = VanillaAlertDialogFooterProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDialogFooter: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDialogFooterProperties> & RefAttributes<VanillaAlertDialogFooter>
> = /* @__PURE__ */ build<VanillaAlertDialogFooter, AlertDialogFooterProperties>(
  VanillaAlertDialogFooter,
  'VanillaDefaultAlertDialogFooter'
)
