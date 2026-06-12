import type * as THREE from 'three'
import type { Flatland } from '../Flatland'

/**
 * Minimal structural slice of R3F's RootState that compute touches.
 * Typed structurally so this module needs no @react-three/fiber import
 * (the core package must not depend on R3F — only consume its shapes).
 */
interface ComputeState {
  pointer: { set(x: number, y: number): void; x: number; y: number }
  raycaster: {
    setFromCamera(pointer: { x: number; y: number }, camera: THREE.Camera): void
  }
}

/**
 * Build an R3F portal `events.compute` for content portaled into a
 * Flatland's internal scene (spec §8.1).
 *
 * The parent root's default compute already derived pointer NDC from
 * the canvas; flatland renders full-viewport through its own
 * orthographic camera, so the same NDC re-cast from `flatland.camera`
 * yields the correct ray. When flatland isn't ready yet, the compute
 * returns without calling `setFromCamera` — R3F then skips this root
 * for the event (its documented `raycaster.camera === undefined`
 * signal).
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
    state.pointer.set(previous.pointer.x, previous.pointer.y)
    state.raycaster.setFromCamera(state.pointer, flatland.camera)
  }
}
