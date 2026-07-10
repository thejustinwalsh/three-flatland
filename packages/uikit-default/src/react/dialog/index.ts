import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Dialog as VanillaDialog,
  type DialogProperties as VanillaDialogProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Dialog as VanillaDialog } from '@three-flatland/uikit-default'

export type DialogProperties = VanillaDialogProperties & {
  children?: ReactNode
} & ClassListProperties

export const Dialog: ForwardRefExoticComponent<
  PropsWithoutRef<DialogProperties> & RefAttributes<VanillaDialog>
> = /* @__PURE__ */ build<VanillaDialog, DialogProperties>(VanillaDialog, 'VanillaDefaultDialog')

export * from './content.js'
export * from './description.js'
export * from './footer.js'
export * from './header.js'
export * from './title.js'
export * from './trigger.js'
