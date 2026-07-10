import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Label as VanillaLabel,
  type LabelProperties as VanillaLabelProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Label as VanillaLabel } from '@three-flatland/uikit-default'

export type LabelProperties = VanillaLabelProperties & {
  children?: ReactNode
} & ClassListProperties

export const Label: ForwardRefExoticComponent<
  PropsWithoutRef<LabelProperties> & RefAttributes<VanillaLabel>
> = /* @__PURE__ */ build<VanillaLabel, LabelProperties>(VanillaLabel, 'VanillaDefaultLabel')
