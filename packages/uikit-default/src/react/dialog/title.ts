import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogTitle as VanillaDialogTitle,
  type DialogTitleProperties as VanillaDialogTitleProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogTitle as VanillaDialogTitle } from '@three-flatland/uikit-default'

export type DialogTitleProperties = VanillaDialogTitleProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogTitle: ForwardRefExoticComponent<
  PropsWithoutRef<DialogTitleProperties> & RefAttributes<VanillaDialogTitle>
> = /* @__PURE__ */ build<VanillaDialogTitle, DialogTitleProperties>(
  VanillaDialogTitle,
  'VanillaDefaultDialogTitle'
)
