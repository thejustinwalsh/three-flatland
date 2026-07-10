import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertIcon as VanillaAlertIcon,
  type AlertIconProperties as VanillaAlertIconProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertIcon as VanillaAlertIcon } from '@three-flatland/uikit-default'

export type AlertIconProperties = VanillaAlertIconProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertIcon: ForwardRefExoticComponent<
  PropsWithoutRef<AlertIconProperties> & RefAttributes<VanillaAlertIcon>
> = /* @__PURE__ */ build<VanillaAlertIcon, AlertIconProperties>(
  VanillaAlertIcon,
  'VanillaDefaultAlertIcon'
)
