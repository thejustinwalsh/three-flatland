import { useEffect, useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  createDevtoolsProvider,
  DEVTOOLS_BUNDLED,
  isDevtoolsActive,
  type DevtoolsProviderHandle,
} from 'three-flatland'

export interface DevtoolsProviderProps {
  /** Display name shown in the consumer's provider switcher. */
  name?: string
  /** Optional explicit provider id (defaults to a fresh uuid). */
  id?: string
  /** Override the discovery channel name (advanced). */
  discoveryChannelName?: string
}

/**
 * Mount inside `<Canvas>` to publish stats / registry / buffer feeds.
 * Drop it next to your scene — no children, no wrapping:
 *
 * ```tsx
 * <Canvas>
 *   <DevtoolsProvider name="basic-sprite" />
 *   <Scene />
 * </Canvas>
 * ```
 *
 * Passive sampler — does NOT take over rendering. Registers a
 * default-phase `useFrame` and snaps `endFrame → beginFrame` once per
 * tick, leaving R3F's auto-render (and any explicit render useFrame
 * like Flatland's `flatland.render(gl)`) completely alone. The
 * `cpuMs` value reported is the inter-tick interval — equivalent to
 * frame time at 60fps, slightly looser than Flatland's internal
 * tight-bracket measurement when stressed (Flatland's number isolates
 * just its `render()` work; ours covers the whole rAF interval).
 *
 * **Safe to leave in production.** The outer component short-circuits
 * when `DEVTOOLS_BUNDLED` is false (build-time, terser folds the branch
 * away) or when `isDevtoolsActive()` is false (runtime toggle). In
 * those cases the inner component never mounts, no `useFrame` is
 * registered, and R3F's normal auto-render path is untouched.
 */
export function DevtoolsProvider(
  props: DevtoolsProviderProps,
): ReactElement | null {
  if (!DEVTOOLS_BUNDLED) return null
  if (!isDevtoolsActive()) return null
  return <DevtoolsProviderActive {...props} />
}

function DevtoolsProviderActive({
  name,
  id,
  discoveryChannelName,
}: DevtoolsProviderProps): null {
  // Provider creation lives in `useEffect` only — never in render. R3F's
  // concurrent-rendering + StrictMode double-render can throw away renders
  // before commit, and any side effect we performed in render (like
  // opening BroadcastChannels) would leak as an orphan. Keeping the only
  // construction site inside the committed effect guarantees one live
  // provider per mounted component instance.
  const handleRef = useRef<DevtoolsProviderHandle | null>(null)

  useFrame((state) => {
    const h = handleRef.current
    if (!h || h.disposed) return
    // Default-phase `useFrame` runs every rAF tick BEFORE R3F's
    // auto-render (or whatever render useFrame the example registered).
    // We close the previous tick's window and open the next one, so
    // `cpuMs` measures the full inter-tick interval. We deliberately
    // do NOT use `phase: 'render'` — that would steal R3F's render
    // slot and prevent users from driving their own render path
    // (Flatland's `flatland.render(gl)`, custom passes, etc.).
    h.endFrame(state.gl as never)
    h.beginFrame(performance.now(), state.gl as never)
  })

  useEffect(() => {
    const handle = createDevtoolsProvider({ name, id, discoveryChannelName })
    handleRef.current = handle
    return () => {
      handle.dispose()
      if (handleRef.current === handle) handleRef.current = null
    }
  }, [name, id, discoveryChannelName])

  return null
}
