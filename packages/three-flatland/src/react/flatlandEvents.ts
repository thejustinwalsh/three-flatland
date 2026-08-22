import type * as THREE from 'three'
import { Vector2 } from 'three'
import type { Flatland } from '../Flatland'
import { PixelPerfectCamera } from '../cameras/PixelPerfectCamera'

const _flatlandPointer = new Vector2()

/**
 * Minimal structural slice of R3F's RootState that compute touches.
 * Typed structurally so this module needs no @react-three/fiber import
 * (the core package must not depend on R3F — only consume its shapes).
 */
interface ComputeState {
  pointer: { set(x: number, y: number): void; x: number; y: number }
  camera?: THREE.Camera
  size?: { width: number; height: number }
  viewport?: { dpr: number }
  raycaster: {
    setFromCamera(pointer: { x: number; y: number }, camera: THREE.Camera): void
  }
}

/**
 * Build an R3F portal `events.compute` for content portaled into a
 * Flatland's internal scene (spec §8.1).
 *
 * The parent root's compute supplies pointer NDC. When either camera owns a
 * centered pixel viewport, the point is converted back through the parent's
 * logical viewport and into Flatland's viewport before the ray is cast. A
 * point in Flatland's letterbox region leaves `raycaster.camera` undefined,
 * R3F's documented signal to skip this portal root for the event.
 *
 * @example
 * createPortal(children, flatland.scene, {
 *   events: { compute: createFlatlandCompute(() => flatlandRef.current), priority: 1 },
 * })
 */
export function createFlatlandCompute(getFlatland: () => Flatland | null) {
  return function flatlandCompute(
    _event: unknown,
    state: ComputeState & { raycaster: { camera?: unknown } },
    previous?: ComputeState
  ): void {
    const flatland = getFlatland()
    if (!flatland || !previous) {
      // Signal to R3F that this portal root is not ready — R3F skips
      // the root for the event when raycaster.camera is undefined.
      state.raycaster.camera = undefined
      return
    }

    const targetCamera = flatland.camera
    if (targetCamera instanceof PixelPerfectCamera && previous.size && previous.viewport) {
      const dpr = previous.viewport.dpr
      let surfaceX: number
      let surfaceY: number

      if (previous.camera instanceof PixelPerfectCamera) {
        const parentViewport = previous.camera.getLogicalViewport(dpr)
        surfaceX = parentViewport.x + ((previous.pointer.x + 1) / 2) * parentViewport.z
        surfaceY = parentViewport.y + ((1 - previous.pointer.y) / 2) * parentViewport.w
      } else {
        surfaceX = ((previous.pointer.x + 1) / 2) * previous.size.width
        surfaceY = ((1 - previous.pointer.y) / 2) * previous.size.height
      }

      targetCamera.getNormalizedDeviceCoordinates(surfaceX, surfaceY, dpr, _flatlandPointer)
      state.pointer.set(_flatlandPointer.x, _flatlandPointer.y)
      if (Math.abs(_flatlandPointer.x) > 1 || Math.abs(_flatlandPointer.y) > 1) {
        state.raycaster.camera = undefined
        return
      }
    } else {
      state.pointer.set(previous.pointer.x, previous.pointer.y)
    }
    state.raycaster.setFromCamera(state.pointer, targetCamera)
  }
}
