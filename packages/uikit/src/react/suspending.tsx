import { type ReactNode, type RefAttributes, forwardRef, useEffect } from 'react'
import {
  Video,
  type VanillaVideo,
  Image,
  type VanillaImage,
  type ClassListProperties,
} from './index.js'
import { useLoader } from '@react-three/fiber'
import { SRGBColorSpace, TextureLoader } from 'three'
import { suspend } from 'suspend-react'
import {
  type ImageOutProperties,
  type InProperties,
  updateVideoElementSrc,
  type VideoOutProperties,
  type VideoSrc,
} from '../index.js'

export type SuspendingImageProperties = InProperties<Omit<ImageOutProperties<never>, 'src'>> & {
  src: string
} & ClassListProperties

/**
 * be aware that this component does not dispose the loaded texture
 */
export const SuspendingImage: (
  props: SuspendingImageProperties & RefAttributes<VanillaImage>
) => ReactNode = forwardRef(({ src, ...props }, ref) => {
  const texture = useLoader(TextureLoader, src)
  // `texture` is a three.js Texture (a vanilla GPU resource, not a React-tracked
  // value) — configuring it imperatively after load is standard three.js/R3F
  // practice (mirrors drei's useTexture). Deferred to an effect so the shared,
  // useLoader-cached instance isn't touched on every render, only when it
  // actually changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- imperative three.js resource config, see above
    texture.colorSpace = SRGBColorSpace
    texture.matrixAutoUpdate = false
  }, [texture])
  return <Image ref={ref} src={texture} {...props} />
})

export type SuspendingVideoProperties = InProperties<Omit<VideoOutProperties, 'src'>> & {
  src: Exclude<VideoSrc, HTMLVideoElement>
} & ClassListProperties

const loadVideoElementSymbol = Symbol('load-video-element')

export const SuspendingVideo: (
  props: SuspendingVideoProperties & RefAttributes<VanillaVideo>
) => ReactNode = forwardRef((props, ref) => {
  const element = suspend(loadVideoElement, [loadVideoElementSymbol])
  updateVideoElementSrc(element, props.src)
  // Need to append the element to the document, so auto play works.
  useEffect(() => {
    document.body.appendChild(element)
    return () => element.remove()
  }, [element])
  return <Video ref={ref} {...props} src={element} />
})

function loadVideoElement(): Promise<HTMLVideoElement> {
  const result = document.createElement('video')
  result.style.position = 'absolute'
  result.style.width = '1px'
  result.style.zIndex = '-1000'
  result.style.top = '0px'
  result.style.left = '0px'
  return new Promise((resolve) => {
    const handleLoadedData = () => {
      result.removeEventListener('loadeddata', handleLoadedData)
      resolve(result)
    }

    // Check if the video already has data loaded
    if (result.readyState >= 2) {
      resolve(result)
    } else {
      result.addEventListener('loadeddata', handleLoadedData)
    }
  })
}
