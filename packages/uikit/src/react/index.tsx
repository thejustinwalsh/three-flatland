export {
  basedOnPreferredColorScheme,
  setPreferredColorScheme,
  getPreferredColorScheme,
  withOpacity,
  isDarkMode,
  canvasInputProps,
  installIconAtlas,
  getInstalledAtlasNames,
} from '../index.js'
export { noEvents, PointerEvents } from './events.js'

declare module '@react-three/fiber' {
  interface ThreeElements {
    vanillaFullscreen: ThreeElement<typeof VanillaFullscreen>
  }
}

import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { build, useRenderContext, useSetup } from './build.js'
import {
  Container as VanillaContainer,
  type ContainerProperties as VanillaContainerProperties,
  Content as VanillaContent,
  type ContentProperties as VanillaContentProperties,
  Custom as VanillaCustom,
  type CustomProperties as VanillaCustomProperties,
  Fullscreen as VanillaFullscreen,
  type FullscreenProperties as VanillaFullscreenProperties,
  Image as VanillaImage,
  type ImageProperties as VanillaImageProperties,
  Video as VanillaVideo,
  type VideoProperties as VanillaVideoProperties,
  Input as VanillaInput,
  type InputProperties as VanillaInputProperties,
  Svg as VanillaSvg,
  type SvgProperties as VanillaSvgProperties,
  Text as VanillaText,
  Textarea as VanillaTextarea,
  type TextareaProperties as VanillaTextareaProperties,
  type InProperties,
  type TextOutProperties,
} from '../index.js'
import {
  createPortal,
  extend,
  type ThreeElement,
  useFrame,
  useStore,
  useThree,
} from '@react-three/fiber'
import { Object3D } from 'three'
import { jsx } from 'react/jsx-runtime'

export type ClassListProperties = { classList?: Array<string | InProperties> }

export type ContainerProperties = VanillaContainerProperties & {
  children?: ReactNode
} & ClassListProperties
export type ContentProperties = VanillaContentProperties & {
  children?: ReactNode
} & ClassListProperties
export type CustomProperties = VanillaCustomProperties & {
  children?: ReactNode
} & ClassListProperties
export type ImageProperties = VanillaImageProperties & ClassListProperties
export type VideoProperties = VanillaVideoProperties & ClassListProperties
export type InputProperties = VanillaInputProperties & ClassListProperties
export type SvgProperties = VanillaSvgProperties & ClassListProperties
export type TextareaProperties = VanillaTextareaProperties & ClassListProperties
export type TextProperties = InProperties<Omit<TextOutProperties, 'text'>> & {
  children?: unknown
} & ClassListProperties
export type FullscreenProperties = VanillaFullscreenProperties & {
  children?: ReactNode
  attachCamera?: boolean
} & ClassListProperties

export {
  readReactive,
  type FontFamilies,
  type BaseOutProperties,
  Component as VanillaComponent,
  Container as VanillaContainer,
  type ContainerProperties as VanillaContainerProperties,
  Content as VanillaContent,
  type ContentProperties as VanillaContentProperties,
  Custom as VanillaCustom,
  type CustomProperties as VanillaCustomProperties,
  Fullscreen as VanillaFullscreen,
  type FullscreenProperties as VanillaFullscreenProperties,
  Image as VanillaImage,
  type ImageProperties as VanillaImageProperties,
  Video as VanillaVideo,
  type VideoProperties as VanillaVideoProperties,
  Input as VanillaInput,
  type InputProperties as VanillaInputProperties,
  Svg as VanillaSvg,
  type SvgProperties as VanillaSvgProperties,
  Text as VanillaText,
  type TextProperties as VanillaTextProperties,
  Textarea as VanillaTextarea,
  type TextareaProperties as VanillaTextareaProperties,
} from '../index.js'

export const Container = /* @__PURE__ */ build<VanillaContainer, ContainerProperties>(
  VanillaContainer
)
export const Content = /* @__PURE__ */ build<VanillaContent, ContentProperties>(VanillaContent)
export const Custom = /* @__PURE__ */ build<VanillaCustom, CustomProperties>(VanillaCustom)
export const Image = /* @__PURE__ */ build<VanillaImage, ImageProperties>(VanillaImage)
export const Video = /* @__PURE__ */ build<VanillaVideo, VideoProperties>(VanillaVideo)
export const Input = /* @__PURE__ */ build<VanillaInput, InputProperties>(VanillaInput)
export const Svg = /* @__PURE__ */ build<VanillaSvg, SvgProperties>(VanillaSvg)
export const Textarea = /* @__PURE__ */ build<VanillaTextarea, TextareaProperties>(VanillaTextarea)

export const Fullscreen = /* @__PURE__ */ (() => {
  extend({ VanillaFullscreen })
  return forwardRef<VanillaFullscreen, FullscreenProperties>(
    ({ children, attachCamera, ...props }, forwardRef) => {
      const hasAttached = useRef(false)
      useFrame(({ camera, scene }) => {
        //attach camera to something so we can see the camera
        if (camera.parent == null && (attachCamera ?? true)) {
          scene.add(camera)
          hasAttached.current = true
        }
      })
      const store = useStore()
      //cleanup attaching the camera
      useEffect(
        () => () => {
          if (!hasAttached.current) {
            return
          }
          hasAttached.current = false
          const { camera, scene } = store.getState()
          if (camera.parent != scene) {
            return
          }
          scene.remove(camera)
        },
        [store]
      )
      const camera = useThree((s) => s.camera)
      const fullscreenWrapper = useMemo(() => new Object3D(), [])
      fullscreenWrapper.parent?.remove(fullscreenWrapper)
      camera.add(fullscreenWrapper)
      const renderer = useThree((s) => s.gl)
      const ref = useRef<VanillaFullscreen>(null)
      useImperativeHandle(forwardRef, () => ref.current!, [])
      const renderContext = useRenderContext()
      const args = useMemo(
        () => [renderer, props, undefined, { renderContext }],
        // `props` is intentionally excluded: `args` must stay referentially stable
        // across prop-only re-renders so R3F does not reconstruct the vanilla
        // instance. Live prop updates flow through `resetProperties` in useSetup;
        // `args` only needs the props present at construction time.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [renderer, renderContext]
      )
      const outProps = useSetup(ref, props, args)
      // `injectScene: false` is load-bearing on @react-three/fiber@10. By
      // default v10's Portal inserts an intermediate `Scene` between the
      // container and the portalled children, which breaks Fullscreen twice
      // over: (a) the extra hop makes the ancestor chain
      // camera → wrapper → injected Scene → Fullscreen, exceeding
      // `searchFor(this, Camera, 2, true)`'s maxSteps (written for v9, where
      // portal children attached directly to the container); (b) under
      // <StrictMode> the Portal's cleanup-only layout effect removes and
      // disposes the injected Scene on the dev double-invoke and never
      // re-adds it, orphaning the HUD permanently. With `injectScene: false`
      // children attach straight to the wrapper (v9 semantics) and the
      // cleanup no-ops (`portalScene === container`).
      return createPortal(
        <vanillaFullscreen {...outProps} ref={ref}>
          {children}
        </vanillaFullscreen>,
        fullscreenWrapper,
        { injectScene: false }
      )
    }
  )
})()

export const Text = /* @__PURE__ */ (() => {
  extend({ VanillaText })
  return forwardRef<VanillaText, TextProperties>(({ children, ...props }, forwardRef) => {
    const ref = useRef<VanillaText>(null)
    useImperativeHandle(forwardRef, () => ref.current!, [])
    const renderContext = useRenderContext()
    const inProps = { ...props, text: children }
    // `inProps` is intentionally excluded: `args` must stay referentially stable
    // across prop-only re-renders so R3F does not reconstruct the vanilla
    // instance. Live prop updates flow through `resetProperties` in useSetup;
    // `args` only needs the props present at construction time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const args = useMemo(() => [inProps, undefined, { renderContext }], [renderContext])
    const outProps = useSetup(ref, inProps, args)
    return jsx(`vanillaText` as any, { ...outProps, ref })
  })
})()

export * from './portal.js'
export * from './build.js'
export * from './suspending.js'
export * from './deprecated.js'
export * from './use-ttf.js'
