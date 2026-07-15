import type { ForwardRefExoticComponent, PropsWithoutRef, ReactNode, RefAttributes } from 'react'
import {
  Video as VanillaVideo,
  type VideoProperties as VanillaVideoProperties,
} from '@three-flatland/uikit-default'
import { build, type ClassListProperties } from '@three-flatland/uikit/react'

export { Video as VanillaVideo } from '@three-flatland/uikit-default'

export type VideoProperties = VanillaVideoProperties & ClassListProperties

export const Video: ForwardRefExoticComponent<
  PropsWithoutRef<VideoProperties> & RefAttributes<VanillaVideo>
> = /* @__PURE__ */ build<VanillaVideo, VideoProperties>(VanillaVideo, 'VanillaDefaultVideo')
