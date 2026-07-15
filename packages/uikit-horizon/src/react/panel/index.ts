import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Panel as VanillaPanel,
  type PanelProperties as VanillaPanelProperties,
} from '@three-flatland/uikit-horizon'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Panel as VanillaPanel } from '@three-flatland/uikit-horizon'

export type PanelProperties = VanillaPanelProperties & {
  children?: ReactNode
} & ClassListProperties

export const Panel: ForwardRefExoticComponent<
  PropsWithoutRef<PanelProperties> & RefAttributes<VanillaPanel>
> = /* @__PURE__ */ build<VanillaPanel, PanelProperties>(VanillaPanel, 'VanillaHorizonPanel')
