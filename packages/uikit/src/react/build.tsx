import {
  type Component,
  type EventHandlers,
  type RenderContext,
  reversePainterSortStable,
} from '../index.js'
import { effect } from '@preact/signals-core'
import {
  extend,
  getScheduler,
  useStore,
  useThree,
  type Instance,
  applyProps,
} from '@react-three/fiber'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import { jsx } from 'react/jsx-runtime'

// R3F stashes its per-object instance descriptor on `__r3f`; uikit pokes its `.props`
// (in `useSetup`) so R3F re-applies uikit's freshly-derived event handlers. We do NOT
// augment `Object3D.__r3f` here: R3F-adjacent packages already do, with mutually
// incompatible shapes — `@pmndrs/pointer-events` (a uikit dependency, pulled in by the
// `PointerEvents` binding) types it as a minimal `{ eventCount, handlers, root }` with
// no `props`, and TS rejects a conflicting re-declaration (TS2717). Instead we reach the
// field through this local structural type; the runtime value is always R3F's real
// instance, which does carry `props`.
type R3FHandle = { props: Record<string, unknown> }
const r3fHandle = (object: Component): R3FHandle | undefined =>
  (object as unknown as { __r3f?: R3FHandle }).__r3f

export function build<T extends Component, P>(Component: { new (): T }, name = Component.name) {
  extend({ [`Vanilla${name}`]: Component })
  return forwardRef<T, P>(({ children, ...props }: any, forwardRef) => {
    const ref = useRef<Component>(null)
    useImperativeHandle(forwardRef, () => ref.current! as T, [])
    const renderContext = useRenderContext()
    // `props` is intentionally excluded: `args` must stay referentially stable
    // across prop-only re-renders so R3F does not reconstruct the vanilla
    // instance. Live prop updates flow through `resetProperties` in useSetup;
    // `args` only needs the props present at construction time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const args = useMemo(() => [props, undefined, { renderContext }], [renderContext])
    const outProps = useSetup(ref, props, args)
    return jsx(`vanilla${name}` as any, { ref, children, ...outProps })
  })
}

export function useRenderContext() {
  const invalidate = useThree((s) => s.invalidate)
  return useMemo<RenderContext>(() => ({ requestFrame: invalidate }), [invalidate])
}

/**
 * @returns the props that should be applied to the component
 */
export function useSetup(ref: { current: Component | null }, inProps: any, args: Array<any>): any {
  // Pump uikit's tree once per frame — but only register a scheduler job for
  // components that are actually ROOTS (no uikit parent). `useSetup` runs for
  // EVERY component wrapper, so registering one `useFrame`-style job per
  // wrapper regardless of root-ness put one dead callback per scene object on
  // R3F's per-frame job list: `Component.update()`'s own `root.component !=
  // this` early-return only skips the WORK, not the registration, so the
  // scheduler still walked and invoked every one of them every frame. A grid
  // of a few thousand labels put thousands of no-op jobs on the scheduler.
  //
  // Upstream subscribes through R3F's internal priority loop:
  //   `store.getState().internal.subscribe({ current: (_, d) => c.update(d * 1000) }, 0, store)`
  // That API is gone in `@react-three/fiber@10` — v10 replaced the priority loop with a
  // named-phase `Scheduler` that exposes an imperative `register(callback, options) =>
  // unregister` primitive (the same one `useFrame` calls into under the hood). We drive
  // that primitive directly, gated by the component's `root` signal via `effect()`, so
  // only components that ARE a root ever hold a scheduler slot; non-roots register
  // nothing and detach their job the moment they stop being root. R3F's delta is
  // seconds; uikit wants ms.
  const store = useStore()
  useEffect(() => {
    const component = ref.current
    if (component == null) return undefined
    const scheduler = getScheduler()
    let unregister: (() => void) | undefined
    const unsubscribe = effect(() => {
      const isRoot = component.root.value.component === component
      if (isRoot === (unregister != null)) return
      if (!isRoot) {
        unregister?.()
        unregister = undefined
        return
      }
      unregister = scheduler.register(
        (_, delta) => {
          // R3F's `createPortal` constructs the instance and assigns its ref BEFORE
          // attaching it to the portal container, so on the first frame `parent` is
          // still null. `Fullscreen.update()` searches its ancestors for a Camera and
          // throws when it finds none, which would blow up the frame job. A detached
          // tree has nothing to lay out anyway.
          if (component.parent == null) return
          component.update(delta * 1000)
        },
        { rootId: store.getState().internal.rootId }
      )
    })
    return () => {
      unsubscribe()
      unregister?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args])
  const renderer = useThree((s) => s.gl)
  useEffect(() => {
    // no `renderer.localClippingEnabled` — that flag exists only on the legacy
    // WebGLRenderer; the common (WebGPU) renderer clips exclusively through
    // clipping-group contexts (see content.ts/custom.ts) and the panel
    // materials' own coverage-multiply clip paths.
    renderer.setTransparentSort(reversePainterSortStable)
  }, [renderer])
  useLayoutEffect(() => {
    ref.current?.resetProperties(inProps)
  })
  useEffect(() => {
    const classList = inProps.classList
    const component = ref.current
    if (!Array.isArray(classList) || component == null) {
      component?.classList.set()
      return
    }
    component.classList.set(...classList)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(inProps.classList)])
  const outPropsRef = useRef<{ args: Array<any> } & EventHandlers>({ args })
  useEffect(() => {
    const container = ref.current
    if (container == null) {
      return undefined
    }
    const unsubscribe = effect(() => {
      const { value: handlers } = container.handlers
      const eventCount = Object.keys(handlers).length
      if (eventCount === 0) {
        outPropsRef.current = { args }
      } else {
        outPropsRef.current = { args, ...handlers }
      }
      const instance = r3fHandle(container)
      if (instance != null) {
        instance.props = outPropsRef.current
        applyProps(container as Instance['object'], outPropsRef.current)
      }
    })
    return () => {
      unsubscribe()
      outPropsRef.current = { args }
      const instance = r3fHandle(container)
      if (instance != null) {
        instance.props = outPropsRef.current
      }
      applyProps(container as Instance['object'], outPropsRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args])
  return outPropsRef.current
}
