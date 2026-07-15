import { boolean, custom, string, union } from 'zod'
import type { z } from 'zod'
import { createInPropertiesSchema, defineSchema, numberValueSchema } from '../properties/schema.js'
import { type ImageOutProperties, Image, imageOutPropertiesSchema } from './image.js'
import { SRGBColorSpace, VideoTexture } from 'three'
import { computed, signal } from '@preact/signals-core'
import type { BaseOutProperties, InProperties, WithSignal } from '../properties/index.js'
import { abortableEffect, loadResourceWithParams } from '../utils.js'
import type { RenderContext } from '../context.js'
import { parseNumberValue, type NumberValue } from '../properties/values.js'
export const videoOutPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  imageOutPropertiesSchema.omit({ src: true }).extend({
    src: union([
      string(),
      custom<MediaProvider>(
        (value) => typeof MediaStream !== 'undefined' && value instanceof MediaStream
      ),
      custom<HTMLVideoElement>(
        (value) => typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement
      ),
    ]).optional(),
    volume: numberValueSchema.optional(),
    preservesPitch: boolean().optional(),
    playbackRate: numberValueSchema.optional(),
    muted: boolean().optional(),
    loop: boolean().optional(),
    autoplay: boolean().optional(),
    crossOrigin: string().nullable().optional(),
  })
)
export const VideoPropertiesSchema = /* @__PURE__ */ defineSchema(() =>
  createInPropertiesSchema(videoOutPropertiesSchema)
)

export type VideoSrc = HTMLVideoElement['src'] | HTMLVideoElement['srcObject'] | HTMLVideoElement
export type VideoOutProperties = ImageOutProperties<VideoSrc> & {
  volume?: NumberValue
  preservesPitch?: boolean
  playbackRate?: NumberValue
  muted?: boolean
  loop?: boolean
  autoplay?: boolean
  crossOrigin?: string | null
}
export type VideoProperties = z.input<typeof VideoPropertiesSchema>

function isVideoElement(value: VideoSrc | undefined): value is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement
}

export class Video<
  OutProperties extends VideoOutProperties = VideoOutProperties,
> extends Image<OutProperties> {
  readonly element = signal<HTMLVideoElement | undefined>()

  constructor(
    inputProperties?: InProperties<OutProperties>,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    protected inputConfig?: {
      renderContext?: RenderContext
      defaultOverrides?: InProperties<OutProperties>
      defaults?: WithSignal<OutProperties>
    }
  ) {
    super(inputProperties, initialClasses, {
      loadTexture: false,
      ...inputConfig,
    })

    const srcIsElement = computed(() => isVideoElement(this.properties.value.src))
    const notYetLoadedElement = computed(() => {
      if (srcIsElement.value) {
        return this.properties.value.src as HTMLVideoElement
      }
      if (typeof document === 'undefined') {
        return undefined
      }
      const element = document.createElement('video')
      element.style.position = 'absolute'
      element.style.width = '1px'
      element.style.zIndex = '-1000'
      element.style.top = '0px'
      element.style.left = '0px'
      return element
    })
    abortableEffect(() => {
      const element = notYetLoadedElement.value
      if (element == null) {
        return
      }
      element.playsInline = true
      element.volume = parseNumberValue(this.properties.value.volume ?? 1)
      element.preservesPitch = this.properties.value.preservesPitch ?? true
      element.playbackRate = parseNumberValue(this.properties.value.playbackRate ?? 1)
      element.muted = this.properties.value.muted ?? false
      element.loop = this.properties.value.loop ?? false
      element.autoplay = this.properties.value.autoplay ?? false
      element.crossOrigin = this.properties.value.crossOrigin ?? null
      const src = this.properties.value.src
      if (isVideoElement(src)) {
        return
      }
      updateVideoElementSrc(element, src)
    }, this.abortSignal)
    abortableEffect(() => {
      const element = notYetLoadedElement.value
      if (typeof document === 'undefined' || srcIsElement.value || element == null) {
        return
      }
      document.body.appendChild(element)
      return () => element.remove()
    }, this.abortSignal)
    loadResourceWithParams(
      this.element,
      loadVideoElement,
      () => {},
      this.abortSignal,
      notYetLoadedElement
    )

    abortableEffect(() => {
      const element = this.element.value
      if (element == null) {
        return
      }
      const updateTexture = () => {
        const previous = this.texture.peek()
        const texture = new VideoTexture(element)
        texture.colorSpace = SRGBColorSpace
        // Guard the first GPU copy: marking the texture dirty before the video
        // has a decodable frame makes the WebGPU backend copy an empty resource
        // ("CopyExternalImageToTexture: Browser fails extracting valid
        // resource"). Below HAVE_CURRENT_DATA the texture stays at version 0 —
        // the renderer binds a default texture and no copy is attempted — and
        // self-heals through `markDirty` (rVFC / 'loadeddata') once frames
        // exist.
        if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          texture.needsUpdate = true
        }
        this.texture.value = texture
        // the panel material has already switched to the new texture (signals
        // are synchronous) — disposing the old one cancels its internal rVFC
        // loop and frees its GPU copy
        previous?.dispose()
      }
      // re-upload as soon as data arrives (first decodable frame or a seek
      // while paused) — VideoTexture's own rVFC covers playback, but not
      // browsers without requestVideoFrameCallback
      const markDirty = () => {
        const texture = this.texture.peek()
        if (texture != null && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          texture.needsUpdate = true
          this.root.peek().requestRender?.()
        }
      }
      updateTexture()
      element.addEventListener('resize', updateTexture)
      element.addEventListener('loadeddata', markDirty)
      element.addEventListener('seeked', markDirty)
      return () => {
        element.removeEventListener('resize', updateTexture)
        element.removeEventListener('loadeddata', markDirty)
        element.removeEventListener('seeked', markDirty)
        this.texture.peek()?.dispose()
      }
    }, this.abortSignal)

    abortableEffect(() => {
      const { requestRender } = this.root.value
      const element = this.element.value
      if (requestRender == null || element == null) {
        return
      }
      // `typeof` (not `in`): the DOM types declare rVFC unconditionally, so an
      // `in` check would narrow `element` to `never` in the fallback branch
      if (typeof element.requestVideoFrameCallback === 'function') {
        let requestId: number
        const callback = () => {
          requestRender()
          requestId = element.requestVideoFrameCallback(callback)
        }
        requestId = element.requestVideoFrameCallback(callback)
        return () => element.cancelVideoFrameCallback(requestId)
      }
      // rVFC-less fallback: the common (WebGPU) renderer never calls
      // VideoTexture.update(), so without requestVideoFrameCallback nothing
      // would ever mark the texture dirty during playback — drive it (and the
      // render loop) per animation frame, gated on readyState so no copy runs
      // on an undecodable frame
      let requestId: number
      const fallback = () => {
        if (!element.paused && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const texture = this.texture.peek()
          if (texture != null) {
            texture.needsUpdate = true
          }
          requestRender()
        }
        requestId = requestAnimationFrame(fallback)
      }
      requestId = requestAnimationFrame(fallback)
      return () => cancelAnimationFrame(requestId)
    }, this.abortSignal)
  }

  clone(recursive?: boolean): this {
    const cloned = new Video(this.inputProperties, this.initialClasses, this.inputConfig) as this
    this.copyInto(cloned, recursive)
    return cloned
  }
}

async function loadVideoElement(element: HTMLVideoElement | undefined) {
  if (element == null) {
    return undefined
  }
  if (element.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((resolve) => (element.onloadedmetadata = resolve))
  }
  return element
}

export function updateVideoElementSrc(
  element: HTMLVideoElement,
  src: Exclude<VideoSrc, HTMLVideoElement> | undefined
) {
  if (src == null) {
    element.removeAttribute('src')
    element.removeAttribute('srcObject')
    return
  }
  if (typeof src === 'string') {
    element.src = src
    return
  }
  element.srcObject = src
}
