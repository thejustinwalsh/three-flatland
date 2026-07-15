import { forwardHtmlEvents } from '@pmndrs/pointer-events'
import { type EventManager, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Camera, Object3D, OrthographicCamera, PerspectiveCamera } from 'three'
import { attachCanvasInputProps } from '../index.js'

/**
 * Disables R3F's own event dispatcher — pass as `<Canvas events={noEvents}>` and
 * pair with {@link PointerEvents}.
 *
 * R3F v10 dispatches events ONLY to JSX-prop handlers (`__r3f.handlers`); it never
 * reads `Object3D.addEventListener` listeners. uikit's interactive components
 * (Slider, Textarea/Input text-selection, scrollbars) register IMPERATIVE
 * `addEventListener` listeners and depend on `@pmndrs/pointer-events` to route them
 * — including pointer CAPTURE with fresh-plane re-intersection, which drives every
 * drag. So on R3F's built-in events a slider has an empty declarative-handler set
 * (never even raycast → no hover, no drag) and text-selection loses its capture the
 * instant the pointer leaves the panel. {@link PointerEvents} restores the full
 * @pmndrs pipeline; running it alongside R3F's dispatcher would fire every handler
 * twice, which is why R3F's is switched off here.
 */
export const noEvents = (): EventManager<HTMLElement> =>
  ({ enabled: false, priority: 0 }) as unknown as EventManager<HTMLElement>

/**
 * Forwards DOM pointer events into `@pmndrs/pointer-events` for a camera + scene
 * (defaults to R3F's). REQUIRED for uikit drag / text-selection / scroll under R3F
 * v10. Mount exactly ONE per canvas (pointers register in a global id→pointer map),
 * point it at the scene that hosts the UI, and pair it with
 * `<Canvas events={noEvents}>`.
 *
 * Mirrors the working vanilla wiring (`forwardHtmlEvents(..., { batchEvents:false })`
 * then `attachCanvasInputProps`): `batchEvents: false` dispatches events immediately
 * instead of queuing them to the next frame (so the Input blur-guard sees the claim
 * in time), and the input-props guard must attach AFTER forwarding so the component
 * claims the pointer-down before the guard reads the claim.
 */
export function PointerEvents({ camera, scene }: { camera?: Camera; scene?: Object3D }): null {
  const domElement = useThree((s) => s.gl.domElement)
  const defaultCamera = useThree((s) => s.camera)
  const defaultScene = useThree((s) => s.scene)
  // forwardHtmlEvents' GetCamera wants a concrete camera; R3F's default is typed
  // as the generic `Camera`. It's only used as a ray source, so the cast is safe.
  const targetCamera = (camera ?? defaultCamera) as PerspectiveCamera | OrthographicCamera
  const targetScene = scene ?? defaultScene
  const updateRef = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    const { destroy, update } = forwardHtmlEvents(domElement, () => targetCamera, targetScene, {
      batchEvents: false,
    })
    updateRef.current = update
    const detach = attachCanvasInputProps(domElement)
    return () => {
      updateRef.current = undefined
      detach()
      destroy()
    }
  }, [domElement, targetCamera, targetScene])
  useFrame(() => updateRef.current?.())
  return null
}
