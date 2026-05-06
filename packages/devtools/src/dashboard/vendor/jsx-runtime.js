/**
 * Minimal Preact JSX-runtime shim.
 *
 * TypeScript's `jsxImportSource: "preact"` compiles JSX to `jsx(type, props)` /
 * `jsxs(type, props)` calls from `preact/jsx-runtime`. This shim re-exports
 * Preact's `h` under those names. Children arrive in `props.children` instead
 * of as variadic arguments — Preact's `h` accepts both forms.
 *
 * Preact itself is vendored next door at `./preact.module.js`. This file is
 * intentionally minimal so updating Preact is a single-file swap.
 */
export { Fragment } from './preact.module.js'
import { h } from './preact.module.js'

export function jsx(type, props, key) {
  const { children, ...rest } = props ?? {}
  if (key !== undefined) rest.key = key
  return h(type, rest, children)
}

export const jsxs = jsx
export const jsxDEV = jsx
