import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  DialogTrigger as VanillaDialogTrigger,
  type DialogTriggerProperties as VanillaDialogTriggerProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { DialogTrigger as VanillaDialogTrigger } from '@three-flatland/uikit-default'

export type DialogTriggerProperties = VanillaDialogTriggerProperties & {
  children?: ReactNode
} & ClassListProperties

export const DialogTrigger: ForwardRefExoticComponent<
  PropsWithoutRef<DialogTriggerProperties> & RefAttributes<VanillaDialogTrigger>
> = /* @__PURE__ */ build<VanillaDialogTrigger, DialogTriggerProperties>(
  VanillaDialogTrigger,
  'VanillaDefaultDialogTrigger'
)
