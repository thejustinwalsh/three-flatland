import { useLayoutEffect, useRef } from 'react'
import { useThree, type ComputeFunction, type FilterFunction } from '@react-three/fiber/webgpu'
import { Vector4 } from 'three'
import { PixelPerfectCamera, type PixelPerfectCameraOptions } from '../cameras/PixelPerfectCamera'

/** Options for {@link usePixelPerfectCamera}. */
export interface UsePixelPerfectCameraOptions extends PixelPerfectCameraOptions {
  /** Install the camera as the R3F root's default camera. Default: `true`. */
  makeDefault?: boolean
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
    const created = new PixelPerfectCamera(options) as PixelPerfectCamera & { manual?: boolean }
    // R3F must never rewrite this camera's intentionally physical-pixel frustum,
    // including when callers install a makeDefault={false} camera themselves.
    created.manual = true
    cameraRef.current = created
  }
  const camera = cameraRef.current

  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const dpr = useThree((state) => state.viewport.dpr)
  const set = useThree((state) => state.set)
  const setEvents = useThree((state) => state.setEvents)
  const get = useThree((state) => state.get)
  const renderer = useThree((state) => state.renderer)
  const makeDefault = options.makeDefault ?? true

  useLayoutEffect(() => {
    camera.viewSize = options.viewSize ?? 400
    camera.viewWidth = options.viewWidth
    camera.pixelScale = options.pixelScale ?? 'auto'
    camera.near = options.near ?? 0.1
    camera.far = options.far ?? 1000
    camera.setViewportSize(width, height, dpr)
    camera.updateProjectionMatrix()
  }, [camera, dpr, height, options.far, options.near, options.pixelScale, options.viewSize, options.viewWidth, width])

  useLayoutEffect(() => {
    if (!makeDefault) return
    const previous = get().camera
    set({ camera })
    return () => {
      if (get().camera === camera) set({ camera: previous })
    }
  }, [camera, get, makeDefault, set])

  useLayoutEffect(() => {
    if (!makeDefault) return
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
  }, [camera, dpr, height, makeDefault, options.pixelScale, options.viewSize, options.viewWidth, set, width])

  useLayoutEffect(() => {
    if (!makeDefault) return
    const previousViewport = renderer.getViewport(new Vector4())
    const viewport = camera.viewport
    renderer.setViewport(viewport.x / dpr, viewport.y / dpr, viewport.z / dpr, viewport.w / dpr)
    return () => {
      renderer.setViewport(previousViewport)
    }
  }, [camera, dpr, height, makeDefault, options.pixelScale, options.viewSize, options.viewWidth, renderer, width])

  useLayoutEffect(() => {
    if (!makeDefault) return

    const previousCompute = get().events.compute
    const previousFilter = get().events.filter

    const compute: ComputeFunction = (event, state, previousState) => {
      if (previousCompute) {
        previousCompute(event, state, previousState)
      } else {
        state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1)
      }

      const surfaceX = ((state.pointer.x + 1) / 2) * state.size.width
      const surfaceY = ((1 - state.pointer.y) / 2) * state.size.height
      camera.getNormalizedDeviceCoordinates(surfaceX, surfaceY, state.viewport.dpr, state.pointer)
      state.raycaster.setFromCamera(state.pointer, state.camera)
    }

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

  return camera
}
