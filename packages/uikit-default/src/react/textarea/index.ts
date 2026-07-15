import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Textarea as VanillaTextarea,
  type TextareaProperties as VanillaTextareaProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Textarea as VanillaTextarea } from '@three-flatland/uikit-default'

export type TextareaProperties = VanillaTextareaProperties & ClassListProperties

export const Textarea: ForwardRefExoticComponent<
  PropsWithoutRef<TextareaProperties> & RefAttributes<VanillaTextarea>
> = /* @__PURE__ */ build<VanillaTextarea, TextareaProperties>(
  VanillaTextarea,
  'VanillaDefaultTextarea'
)
