import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  AlertDescription as VanillaAlertDescription,
  type AlertDescriptionProperties as VanillaAlertDescriptionProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { AlertDescription as VanillaAlertDescription } from '@three-flatland/uikit-default'

export type AlertDescriptionProperties = VanillaAlertDescriptionProperties & {
  children?: ReactNode
} & ClassListProperties

export const AlertDescription: ForwardRefExoticComponent<
  PropsWithoutRef<AlertDescriptionProperties> & RefAttributes<VanillaAlertDescription>
> = /* @__PURE__ */ build<VanillaAlertDescription, AlertDescriptionProperties>(
  VanillaAlertDescription,
  'VanillaDefaultAlertDescription'
)
