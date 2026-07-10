import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Input as VanillaInput,
  type InputProperties as VanillaInputProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Input as VanillaInput } from '@three-flatland/uikit-default'

export type InputProperties = VanillaInputProperties & ClassListProperties

export const Input: ForwardRefExoticComponent<
  PropsWithoutRef<InputProperties> & RefAttributes<VanillaInput>
> = /* @__PURE__ */ build<VanillaInput, InputProperties>(VanillaInput, 'VanillaDefaultInput')
