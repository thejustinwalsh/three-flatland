import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Slider as VanillaSlider,
  type SliderProperties as VanillaSliderProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Slider as VanillaSlider } from '@three-flatland/uikit-default'

export type SliderProperties = VanillaSliderProperties & ClassListProperties

export const Slider: ForwardRefExoticComponent<
  PropsWithoutRef<SliderProperties> & RefAttributes<VanillaSlider>
> = /* @__PURE__ */ build<VanillaSlider, SliderProperties>(VanillaSlider, 'VanillaDefaultSlider')
