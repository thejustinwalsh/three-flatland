import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertTitle as VanillaAlertTitle,
  type AlertTitleProperties as VanillaAlertTitleProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertTitle as VanillaAlertTitle } from '@three-flatland/uikit-default'

export type AlertTitleProperties = VanillaAlertTitleProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertTitle: ForwardRefExoticComponent<
  PropsWithoutRef<AlertTitleProperties> & RefAttributes<VanillaAlertTitle>
> = /* @__PURE__ */ build<VanillaAlertTitle, AlertTitleProperties>(
  VanillaAlertTitle,
  'VanillaDefaultAlertTitle'
)
