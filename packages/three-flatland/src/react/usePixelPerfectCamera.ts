import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree, type ComputeFunction, type FilterFunction } from '@react-three/fiber/webgpu'
import { Vector2, Vector4 } from 'three'
import { PixelPerfectCamera, type PixelPerfectCameraOptions } from '../cameras/PixelPerfectCamera'
import { getRendererViewportDepthRange, setRendererViewport } from '../cameras/rendererViewport'
import { markPixelPerfectCompute } from './flatlandEvents'

/** Options for {@link usePixelPerfectCamera}. */
export interface UsePixelPerfectCameraOptions extends PixelPerfectCameraOptions {
  /** Install the camera as the R3F root's default camera. Default: `true`. */
  makeDefault?: boolean
}

/** Options for binding an existing pixel camera to an R3F root. */
export interface UsePixelPerfectCameraBindingOptions {
  /** Install the camera as the R3F root's default camera. Default: `true`. */
  makeDefault?: boolean
  /**
   * Change this value when mutating external camera view settings outside the
   * hook so R3F's derived viewport is synchronized in the same commit.
   */
  projectionKey?: unknown
}

/**
 * Create and resize a {@link PixelPerfectCamera} from R3F's CSS size and DPR.
 *
 * The hook installs the camera as the root default unless `makeDefault` is
 * false, and restores the previous camera when unmounted. R3F's own
 * orthographic resize path is marked manual so it cannot overwrite the
 * physical-pixel projection. The renderer viewport, R3F viewport metrics,
 * and pointer-event mapping follow the camera's centered pixel viewport.
 *
 * @example
 * ```tsx
 * function Scene() {
 *   usePixelPerfectCamera({ viewSize: 240 })
 *   return <sprite2D pixelPerfect texture={texture} />
 * }
 * ```
 */
export function usePixelPerfectCamera(options: UsePixelPerfectCameraOptions = {}): PixelPerfectCamera {
  const cameraRef = useRef<PixelPerfectCamera | null>(null)
  if (cameraRef.current === null) {
    cameraRef.current = new PixelPerfectCamera(options)
  }
  const camera = cameraRef.current

  useLayoutEffect(() => {
    camera.viewSize = options.viewSize ?? 400
    camera.viewWidth = options.viewWidth
    camera.pixelScale = options.pixelScale ?? 'auto'
    camera.near = options.near ?? 0.1
    camera.far = options.far ?? 1000
    camera.updateProjectionMatrix()
  }, [camera, options.far, options.near, options.pixelScale, options.viewSize, options.viewWidth])

  const projectionKey = `${options.viewSize ?? 400}:${options.viewWidth ?? ''}:${options.pixelScale ?? 'auto'}`
  usePixelPerfectCameraBinding(camera, { makeDefault: options.makeDefault, projectionKey })
  return camera
}

/**
 * Bind an existing pixel camera—such as `flatland.camera`—to an R3F root.
 *
 * The hook owns only the R3F integration: physical surface sizing, default
 * camera state, viewport metrics, renderer viewport, and letterbox-aware
 * events. The caller retains ownership of the camera and its view settings.
 * Passing `null` is supported so callback refs can attach after mount.
 */
export function usePixelPerfectCameraBinding(
  camera: PixelPerfectCamera | null,
  options: UsePixelPerfectCameraBindingOptions = {}
): void {
  const measuredCameraRef = useRef<PixelPerfectCamera | null>(null)
  const logicalPixelViewportRef = useRef<Vector4 | null>(null)
  if (logicalPixelViewportRef.current === null) logicalPixelViewportRef.current = new Vector4()
  const logicalPixelViewport = logicalPixelViewportRef.current
  const viewportDepthRangeRef = useRef<Vector2 | null>(null)
  if (viewportDepthRangeRef.current === null) viewportDepthRangeRef.current = new Vector2(0, 1)
  const viewportDepthRange = viewportDepthRangeRef.current

  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const dpr = useThree((state) => state.viewport.dpr)
  const set = useThree((state) => state.set)
  const setEvents = useThree((state) => state.setEvents)
  const get = useThree((state) => state.get)
  const renderer = useThree((state) => state.renderer)
  const makeDefault = options.makeDefault ?? true
  const projectionKey = options.projectionKey
  const surfaceSizeRef = useRef({ width, height })
  surfaceSizeRef.current = { width, height }

  useLayoutEffect(() => {
    if (!camera) return
    camera.setViewportSize(width, height, dpr)
    camera.updateProjectionMatrix()
  }, [camera, dpr, height, projectionKey, width])

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return
    const previous = get().camera
    set({ camera })
    return () => {
      if (get().camera === camera) set({ camera: previous })
    }
  }, [camera, get, makeDefault, set])

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return
    const previousGetCurrentViewport = get().viewport.getCurrentViewport
    const getCurrentViewport: typeof previousGetCurrentViewport = (
      requestedCamera = get().camera,
      target,
      requestedSize = get().size
    ) => {
      const result = previousGetCurrentViewport(requestedCamera, target, requestedSize)
      if (!(requestedCamera instanceof PixelPerfectCamera)) return result

      const currentSize = get().size
      let measuredCamera = requestedCamera
      if (requestedSize.width !== currentSize.width || requestedSize.height !== currentSize.height) {
        if (measuredCameraRef.current === null) measuredCameraRef.current = requestedCamera.clone()
        else measuredCameraRef.current.copy(requestedCamera)
        measuredCamera = measuredCameraRef.current
        measuredCamera.setViewportSize(requestedSize.width, requestedSize.height, get().viewport.dpr)
      }
      const worldWidth = measuredCamera.right - measuredCamera.left
      const worldHeight = measuredCamera.top - measuredCamera.bottom
      return {
        ...result,
        width: worldWidth,
        height: worldHeight,
        aspect: worldWidth / worldHeight,
        factor: measuredCamera.resolvedPixelScale / get().viewport.dpr,
      }
    }

    set((state) => ({
      viewport: { ...state.viewport, getCurrentViewport },
    }))
    return () => {
      if (get().viewport.getCurrentViewport !== getCurrentViewport) return
      set((state) => ({
        viewport: { ...state.viewport, getCurrentViewport: previousGetCurrentViewport },
      }))
    }
  }, [camera, get, makeDefault, set])

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return
    const worldWidth = camera.right - camera.left
    const worldHeight = camera.top - camera.bottom
    set((state) => ({
      viewport: {
        ...state.viewport,
        width: worldWidth,
        height: worldHeight,
        aspect: worldWidth / worldHeight,
        factor: camera.resolvedPixelScale / dpr,
      },
    }))
  }, [camera, dpr, height, makeDefault, projectionKey, set, width])

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return
    const previousViewport = renderer.getViewport(new Vector4())
    const previousDepthRange = getRendererViewportDepthRange(renderer, new Vector2())
    viewportDepthRange.copy(previousDepthRange)
    const initialSize = { ...surfaceSizeRef.current }
    const wasFullViewport =
      previousViewport.x === 0 &&
      previousViewport.y === 0 &&
      previousViewport.width === initialSize.width &&
      previousViewport.height === initialSize.height
    return () => {
      const currentSize = surfaceSizeRef.current
      if (wasFullViewport) {
        setRendererViewport(renderer, new Vector4(0, 0, currentSize.width, currentSize.height), previousDepthRange)
      } else if (initialSize.width > 0 && initialSize.height > 0) {
        setRendererViewport(
          renderer,
          new Vector4(
            (previousViewport.x * currentSize.width) / initialSize.width,
            (previousViewport.y * currentSize.height) / initialSize.height,
            (previousViewport.width * currentSize.width) / initialSize.width,
            (previousViewport.height * currentSize.height) / initialSize.height
          ),
          previousDepthRange
        )
      } else {
        setRendererViewport(renderer, previousViewport, previousDepthRange)
      }
    }
  }, [camera, makeDefault, renderer, viewportDepthRange])

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return
    setRendererViewport(renderer, camera.getLogicalViewport(dpr, logicalPixelViewport), viewportDepthRange)
  }, [camera, dpr, height, logicalPixelViewport, makeDefault, projectionKey, renderer, viewportDepthRange, width])

  // R3F/Three reset the renderer viewport to the full canvas synchronously
  // during setSize/setPixelRatio. Rebind immediately before automatic render
  // so no resize frame can escape the integer pixel viewport.
  useFrame(
    (state) => {
      if (!camera || !makeDefault) return
      setRendererViewport(renderer, camera.getLogicalViewport(dpr, logicalPixelViewport), viewportDepthRange)
      const worldWidth = camera.right - camera.left
      const worldHeight = camera.top - camera.bottom
      const factor = camera.resolvedPixelScale / state.viewport.dpr
      if (
        state.viewport.width !== worldWidth ||
        state.viewport.height !== worldHeight ||
        state.viewport.factor !== factor
      ) {
        set((current) => ({
          viewport: {
            ...current.viewport,
            width: worldWidth,
            height: worldHeight,
            aspect: worldWidth / worldHeight,
            factor,
          },
        }))
      }
    },
    { priority: Number.MIN_SAFE_INTEGER }
  )

  useLayoutEffect(() => {
    if (!camera || !makeDefault) return

    const previousCompute = get().events.compute
    const previousFilter = get().events.filter

    const compute: ComputeFunction = markPixelPerfectCompute((event, state, previousState) => {
      if (previousCompute) {
        previousCompute(event, state, previousState)
      } else {
        state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1)
      }

      const surfaceX = ((state.pointer.x + 1) / 2) * state.size.width
      const surfaceY = ((1 - state.pointer.y) / 2) * state.size.height
      camera.getNormalizedDeviceCoordinates(surfaceX, surfaceY, state.viewport.dpr, state.pointer)
      state.raycaster.setFromCamera(state.pointer, state.camera)
    })

    const filter: FilterFunction = (items, state) => {
      if (Math.abs(state.pointer.x) > 1 || Math.abs(state.pointer.y) > 1) return []
      return previousFilter ? previousFilter(items, state) : items
    }

    setEvents({ compute, filter })
    return () => {
      const current = get().events
      const restore: { compute?: ComputeFunction; filter?: FilterFunction } = {}
      if (current.compute === compute) restore.compute = previousCompute
      if (current.filter === filter) restore.filter = previousFilter
      setEvents(restore)
    }
  }, [camera, get, makeDefault, setEvents])
}
