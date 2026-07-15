import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogDescription as VanillaDialogDescription,
  type DialogDescriptionProperties as VanillaDialogDescriptionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogDescription as VanillaDialogDescription } from '@three-flatland/uikit-default'

export type DialogDescriptionProperties = VanillaDialogDescriptionProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogDescription: ForwardRefExoticComponent<
  PropsWithoutRef<DialogDescriptionProperties> & RefAttributes<VanillaDialogDescription>
> = /* @__PURE__ */ build<VanillaDialogDescription, DialogDescriptionProperties>(
  VanillaDialogDescription,
  'VanillaDefaultDialogDescription'
)
