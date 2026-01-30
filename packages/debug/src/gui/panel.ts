import GUI from 'lil-gui'
import type { StoreApi } from 'zustand/vanilla'
import { createStore } from 'zustand/vanilla'
import type {
  ControlSchema,
  ControlEntry,
  ButtonControl,
  ColorControl,
  GuiPanel,
  InferState,
  ValueKeys,
} from './types.js'
import { injectTheme, removeTheme } from './theme.js'

function isButtonControl(entry: ControlEntry): entry is ButtonControl {
  return typeof entry === 'object' && 'type' in entry && entry.type === 'button'
}

function isColorControl(entry: ControlEntry): entry is ColorControl {
  return typeof entry === 'object' && 'type' in entry && entry.type === 'color'
}

function hasOptions(
  entry: ControlEntry,
): entry is { value: string | number; options: Record<string, string | number> | (string | number)[] } {
  return typeof entry === 'object' && 'options' in entry
}

function hasMinMax(entry: ControlEntry): entry is { value: number; min: number; max: number; step?: number } {
  return typeof entry === 'object' && 'min' in entry && 'max' in entry
}

function extractDefaultValue(entry: ControlEntry): string | number | boolean | undefined {
  if (typeof entry === 'number' || typeof entry === 'boolean' || typeof entry === 'string') {
    return entry
  }
  if ('value' in entry) {
    return entry.value
  }
  return undefined
}

/**
 * Build the initial state object from a schema.
 *
 * We iterate the schema at runtime and collect default values for non-button entries.
 * The resulting object structurally matches `InferState<S>`, but TypeScript can't verify
 * this because `InferState` uses conditional types over `const` generic parameters that
 * are erased at runtime. The cast on the return is the single point where we bridge
 * from the dynamic iteration to the statically inferred state shape.
 */
function extractInitialState<const S extends ControlSchema>(schema: S): InferState<S> {
  const state: Record<string, string | number | boolean | undefined> = {}
  for (const [key, entry] of Object.entries(schema)) {
    if (isButtonControl(entry)) continue
    state[key] = extractDefaultValue(entry)
  }
  // Safe: the loop above mirrors InferState<S> — it includes exactly the ValueKeys
  // and extracts the same default value that InferState's conditional type resolves to.
  return state as InferState<S>
}

/**
 * Helper to call `store.setState` with a single dynamic key.
 *
 * TypeScript can't narrow `{ [key]: value }` to `Partial<State>` when `key` is a
 * runtime string, even though we know it's a valid key from iterating the schema.
 * This helper contains that single necessary cast.
 */
function setStoreValue<State>(store: StoreApi<State>, key: string, value: unknown): void {
  store.setState({ [key]: value } as Partial<State>)
}

/**
 * Subscribe to changes on a single key within a zustand store.
 *
 * The `key as keyof State` cast is needed because `key` is a runtime string from
 * schema iteration. The overload signatures on `GuiPanel.on()` guarantee callers
 * only pass valid `ValueKeys<S>`.
 */
function subscribeToKey<State>(
  store: StoreApi<State>,
  key: string,
  cb: (value: unknown, prev: unknown) => void,
): () => void {
  const stateKey = key as keyof State
  let prev = store.getState()[stateKey]
  return store.subscribe((state) => {
    const next = state[stateKey]
    if (!Object.is(next, prev)) {
      const old = prev
      prev = next
      cb(next, old)
    }
  })
}

/**
 * Registry of active panels by title.
 * When createGui is called with a title that already exists (e.g., during HMR),
 * the previous panel is disposed before creating the new one.
 */
const activePanels = new Map<string, { dispose: () => void }>()

export function createGui<const S extends ControlSchema>(title: string, schema: S): GuiPanel<S> {
  // Dispose any existing panel with the same title (handles HMR re-execution)
  const existing = activePanels.get(title)
  if (existing) {
    existing.dispose()
    activePanels.delete(title)
  }

  const initialState = extractInitialState(schema)
  const store = createStore<InferState<S>>()(() => initialState)

  const buttonListeners = new Map<string, Set<() => void>>()

  // Initialize button listener sets
  for (const [key, entry] of Object.entries(schema)) {
    if (isButtonControl(entry)) {
      buttonListeners.set(key, new Set())
    }
  }

  // Production mode — return stub panel (store has defaults, no GUI, no subscriptions)
  const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD
  if (isProd) {
    function noopUnsubscribe(): void {}

    function prodGet<K extends ValueKeys<S>>(key: K): InferState<S>[K] {
      return store.getState()[key]
    }

    // Same pattern as onImpl — the overload requires a cast at the assignment site
    function prodOn(_key: string, _cb: (() => void) | ((value: unknown, prev: unknown) => void)): () => void {
      return noopUnsubscribe
    }

    const prodPanel: GuiPanel<S> = {
      gui: null,
      store,
      get: prodGet,
      on: prodOn as GuiPanel<S>['on'],
      dispose() {
        activePanels.delete(title)
      },
    }
    activePanels.set(title, prodPanel)
    return prodPanel
  }

  // Dev mode — create GUI
  injectTheme()

  const gui = new GUI({ title })
  gui.domElement.classList.add('three-flatland-debug')

  // Mutable proxy object for lil-gui to read/write
  const proxy: Record<string, unknown> = { ...initialState }

  // Track controllers for store→GUI sync
  const controllers = new Map<string, GUI['controllers'][number]>()

  for (const [key, entry] of Object.entries(schema)) {
    if (isButtonControl(entry)) {
      // Button: add a function that fires all listeners
      const fns: Record<string, () => void> = {
        [key]: () => {
          const listeners = buttonListeners.get(key)
          if (listeners) {
            for (const cb of listeners) cb()
          }
        },
      }
      const label = entry.label ?? key
      gui.add(fns, key).name(label)
      continue
    }

    if (isColorControl(entry)) {
      proxy[key] = entry.value
      const ctrl = gui.addColor(proxy, key)
      ctrl.onChange((v: string) => setStoreValue(store, key, v))
      controllers.set(key, ctrl)
      continue
    }

    if (hasOptions(entry)) {
      proxy[key] = entry.value
      const ctrl = gui.add(proxy, key, entry.options)
      ctrl.onChange((v: string | number) => setStoreValue(store, key, v))
      controllers.set(key, ctrl)
      continue
    }

    if (hasMinMax(entry)) {
      proxy[key] = entry.value
      const ctrl = gui.add(proxy, key, entry.min, entry.max, entry.step)
      ctrl.onChange((v: number) => setStoreValue(store, key, v))
      controllers.set(key, ctrl)
      continue
    }

    // Bare value or object with just value
    const val = extractDefaultValue(entry)
    proxy[key] = val
    const ctrl = gui.add(proxy, key)
    ctrl.onChange((v: string | number | boolean) => setStoreValue(store, key, v))
    controllers.set(key, ctrl)
  }

  // Sync store → proxy → controller display for external state changes
  const unsubscribeStore = store.subscribe((state) => {
    for (const [key, ctrl] of controllers) {
      // key is from controllers which only has ValueKeys — safe to index
      const stateKey = key as keyof typeof state
      const value = state[stateKey]
      if (!Object.is(proxy[key], value)) {
        proxy[key] = value
        ctrl.updateDisplay()
      }
    }
  })

  /**
   * Implementation of `GuiPanel.on()`.
   *
   * The overloaded signature on `GuiPanel<S>` discriminates between button keys
   * (callback with no args) and value keys (callback with value + prev). At the
   * implementation level, we accept a union and dispatch based on whether the key
   * exists in `buttonListeners`. The outer cast to `GuiPanel<S>['on']` is required
   * because TypeScript cannot unify an implementation signature with multiple
   * overload declarations on an interface — this is a known TS limitation with
   * overloaded methods on object literals.
   */
  function onImpl(key: string, cb: (() => void) | ((value: unknown, prev: unknown) => void)): () => void {
    // Button key — dispatch to button listener set
    const listeners = buttonListeners.get(key)
    if (listeners) {
      // The overload signature guarantees callers pass () => void for ButtonKeys
      const fn = cb as () => void
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    }

    // Value key — subscribe to store changes for this key
    // The overload signature guarantees callers pass (value, prev) => void for ValueKeys
    return subscribeToKey(store, key, cb as (value: unknown, prev: unknown) => void)
  }

  const panel: GuiPanel<S> = {
    gui,
    store,

    get<K extends ValueKeys<S>>(key: K): InferState<S>[K] {
      return store.getState()[key]
    },

    // See onImpl documentation for why this cast is necessary
    on: onImpl as GuiPanel<S>['on'],

    dispose() {
      activePanels.delete(title)
      unsubscribeStore()
      gui.destroy()
      removeTheme()
    },
  }

  activePanels.set(title, panel)
  return panel
}
