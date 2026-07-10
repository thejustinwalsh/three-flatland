import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Alert as VanillaAlert,
  type AlertProperties as VanillaAlertProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Alert as VanillaAlert } from '@three-flatland/uikit-default'

export type AlertProperties = VanillaAlertProperties & {
  children?: ReactNode
} & ClassListProperties

export const Alert: ForwardRefExoticComponent<
  PropsWithoutRef<AlertProperties> & RefAttributes<VanillaAlert>
> = /* @__PURE__ */ build<VanillaAlert, AlertProperties>(VanillaAlert, 'VanillaDefaultAlert')

export * from './description.js'
export * from './icon.js'
export * from './title.js'
