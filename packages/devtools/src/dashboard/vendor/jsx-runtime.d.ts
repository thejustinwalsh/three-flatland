/**
 * JSX-runtime types for the vendored Preact copy. Mirrors
 * `preact/jsx-runtime/src/index.d.ts` verbatim (structure-wise) but imports
 * from the sibling vendored file instead of the npm-published `preact`.
 */
import {
  Attributes,
  ComponentChild,
  ComponentChildren,
  ComponentType,
  VNode,
} from './preact.module'
import { JSXInternal } from './jsx'

export { Fragment } from './preact.module'
export { JSXInternal as JSX }

export function jsx(
  type: string,
  props: JSXInternal.HTMLAttributes &
    JSXInternal.SVGAttributes &
    Record<string, unknown> & { children?: ComponentChild },
  key?: string,
): VNode<unknown>
export function jsx<P>(
  type: ComponentType<P>,
  props: Attributes & P & { children?: ComponentChild },
  key?: string,
): VNode<unknown>

export function jsxs(
  type: string,
  props: JSXInternal.HTMLAttributes &
    JSXInternal.SVGAttributes &
    Record<string, unknown> & { children?: ComponentChild[] },
  key?: string,
): VNode<unknown>
export function jsxs<P>(
  type: ComponentType<P>,
  props: Attributes & P & { children?: ComponentChild[] },
  key?: string,
): VNode<unknown>

export function jsxDEV(
  type: string,
  props: JSXInternal.HTMLAttributes &
    JSXInternal.SVGAttributes &
    Record<string, unknown> & { children?: ComponentChildren },
  key?: string,
): VNode<unknown>
export function jsxDEV<P>(
  type: ComponentType<P>,
  props: Attributes & P & { children?: ComponentChildren },
  key?: string,
): VNode<unknown>
