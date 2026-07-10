import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogFooter as VanillaDialogFooter,
  type DialogFooterProperties as VanillaDialogFooterProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogFooter as VanillaDialogFooter } from '@three-flatland/uikit-default'

export type DialogFooterProperties = VanillaDialogFooterProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogFooter: ForwardRefExoticComponent<
  PropsWithoutRef<DialogFooterProperties> & RefAttributes<VanillaDialogFooter>
> = /* @__PURE__ */ build<VanillaDialogFooter, DialogFooterProperties>(
  VanillaDialogFooter,
  'VanillaDefaultDialogFooter'
)
