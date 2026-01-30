import type { StoreApi } from 'zustand/vanilla'

export interface NumberControl {
  value: number
  min?: number
  max?: number
  step?: number
}

export interface BooleanControl {
  value: boolean
}

/**
 * SelectControl constrains `value` to be a member of the option values.
 *
 * `V` is the union of all possible option values, inferred from the `options`
 * property. When used with `createGui<const S>`, the `const` generic preserves
 * literal types so `V` resolves to the full union of option values (e.g.,
 * `"sparse" | "normal" | "dense" | "packed"`).
 *
 * The constraint `value: V` ensures the default value must be one of the
 * declared options — a type error at the call site if it isn't.
 */
export interface SelectControl<V extends string | number = string | number> {
  value: V
  options: Record<string, V> | readonly V[]
}

export interface ButtonControl {
  type: 'button'
  label?: string
}

export interface ColorControl {
  value: string
  type: 'color'
}

export type ControlDef = NumberControl | BooleanControl | SelectControl | ButtonControl | ColorControl

export type ControlEntry = ControlDef | number | boolean | string

export type ControlSchema = Record<string, ControlEntry>

/** Keys that hold values (not buttons) */
export type ValueKeys<S extends ControlSchema> = {
  [K in keyof S]: S[K] extends ButtonControl ? never : K
}[keyof S] &
  string

/** Keys that are buttons */
export type ButtonKeys<S extends ControlSchema> = {
  [K in keyof S]: S[K] extends ButtonControl ? K : never
}[keyof S] &
  string

/**
 * Extract option values from a SelectControl.
 *
 * Handles both `Record<string, V>` (keyed dropdown) and `readonly V[]` (array
 * of values). For records, extracts `T[string]` which produces the value union;
 * for arrays, uses `T[number]` to get the element union.
 */
type OptionValues<T> = T extends Record<string, infer V>
  ? V
  : T extends readonly (infer V)[]
    ? V
    : never

/**
 * Infer store state from schema (buttons excluded).
 *
 * Type resolution priority:
 * 1. Entries with `options` → union of all option values (SelectControl)
 * 2. Entries with `min` → `number` (NumberControl with range, not a literal)
 * 3. Entries with `type: 'color'` → `string` (ColorControl)
 * 4. Entries with `value: number` → `number` (NumberControl, widened from literal)
 * 5. Entries with `value: boolean` → `boolean` (BooleanControl, widened from literal)
 * 6. Entries with `value: string` → `string` (widened from literal)
 * 7. Bare number → `number` (widened from literal)
 * 8. Bare boolean → `boolean` (widened from literal)
 * 9. Bare string → `string` (widened from literal)
 */
export type InferState<S extends ControlSchema> = {
  [K in ValueKeys<S>]:
    // SelectControl: extract union of all option values
    S[K] extends { options: infer O }
      ? OptionValues<O>
      // NumberControl with min/max range: widen to number
      : S[K] extends { value: number; min: number }
        ? number
        // ColorControl: widen to string
        : S[K] extends { type: 'color'; value: string }
          ? string
          // Object with value: widen to base type
          : S[K] extends { value: number }
            ? number
            : S[K] extends { value: boolean }
              ? boolean
              : S[K] extends { value: string }
                ? string
                // Bare primitives: widen to base type
                : S[K] extends number
                  ? number
                  : S[K] extends boolean
                    ? boolean
                    : S[K] extends string
                      ? string
                      : never
}

export interface GuiPanel<S extends ControlSchema> {
  /** The lil-gui instance, null in production */
  gui: import('lil-gui').default | null
  /** Zustand vanilla store holding all value state */
  store: StoreApi<InferState<S>>
  /** Get a current value by key */
  get<K extends ValueKeys<S>>(key: K): InferState<S>[K]
  /** Subscribe to value changes — callback receives (value, prev) */
  on<K extends ValueKeys<S>>(
    key: K,
    cb: (value: InferState<S>[K], prev: InferState<S>[K]) => void,
  ): () => void
  /** Subscribe to button clicks — callback receives no args */
  on<K extends ButtonKeys<S>>(key: K, cb: () => void): () => void
  /** Dispose the GUI and all subscriptions */
  dispose(): void
}
