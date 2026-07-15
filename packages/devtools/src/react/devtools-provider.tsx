import { useEffect, useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  createDevtoolsProvider,
  isDevtoolsActive,
  type DevtoolsProviderHandle,
} from 'three-flatland'

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

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
 * `'start'`-phase `useFrame` (beginFrame) and a `'finish'`-phase one
 * (endFrame), bracketing every other job in the tick — including
 * R3F's auto-render and any explicit `'render'`-phase useFrame like
 * Flatland's `flatland.render(gl)` — without stealing the render
 * slot. Both brackets MUST live inside the same scheduler tick:
 * three's `WebGPURenderer` starts an internal `Animation` rAF loop at
 * `init()` that calls `info.reset()` once per frame (autoReset), and
 * that loop is a *separate* rAF callback from R3F's. A window that
 * spans the tick boundary (the old `endFrame → beginFrame` in one
 * default-phase job) has that reset land inside it, so every
 * drawCalls/triangles delta reads 0. Inside one tick the reset can
 * only fall entirely before or after the window, never within it.
 * `cpuMs` is the start→finish span of R3F's frame work — close to
 * Flatland's tight-bracket number, minus inter-frame idle.
 *
 * **Safe to leave in production.** The outer component short-circuits
 * when the devtools build gate is false (build-time, terser folds the
 * branch away) or when `isDevtoolsActive()` is false (runtime toggle). In
 * those cases the inner component never mounts, no `useFrame` is
 * registered, and R3F's normal auto-render path is untouched.
 */
export function DevtoolsProvider(props: DevtoolsProviderProps): ReactElement | null {
  if (process.env.NODE_ENV === 'production' && process.env.FL_DEVTOOLS !== 'true') return null
  if (!isDevtoolsActive()) return null
  return <DevtoolsProviderActive {...props} />
}

function DevtoolsProviderActive({ name, id, discoveryChannelName }: DevtoolsProviderProps): null {
  // Provider creation lives in `useEffect` only — never in render. R3F's
  // concurrent-rendering + StrictMode double-render can throw away renders
  // before commit, and any side effect we performed in render (like
  // opening BroadcastChannels) would leak as an orphan. Keeping the only
  // construction site inside the committed effect guarantees one live
  // provider per mounted component instance.
  const handleRef = useRef<DevtoolsProviderHandle | null>(null)

  // Open the frame window first thing in the tick and close it last
  // thing, so the begin→end span covers exactly this tick's renders.
  // The two jobs MUST be separate phases of the SAME tick — see the
  // component docstring: three's internal Animation loop resets
  // `renderer.info` once per rAF, and a window spanning the tick
  // boundary would have that reset inside it, zeroing every delta.
  // We deliberately do NOT use `phase: 'render'` — that would steal
  // R3F's render slot and prevent users from driving their own render
  // path (Flatland's `flatland.render(gl)`, custom passes, etc.).
  useFrame(
    (state) => {
      const h = handleRef.current
      if (!h || h.disposed) return
      h.beginFrame(performance.now(), state.gl as never)
    },
    { phase: 'start' }
  )
  useFrame(
    (state) => {
      const h = handleRef.current
      if (!h || h.disposed) return
      h.endFrame(state.gl as never)
    },
    { phase: 'finish' }
  )

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
