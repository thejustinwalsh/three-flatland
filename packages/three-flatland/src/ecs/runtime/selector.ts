import type { AnyTrait } from './trait'

export type EventKind = 'added' | 'changed' | 'removed'

declare const selectorBrand: unique symbol
declare const eventSelectorBrand: unique symbol

interface CompiledRequirements {
  readonly words: readonly number[]
  readonly masks: readonly number[]
}

export interface Selector extends CompiledRequirements {
  readonly id: number
  readonly required: readonly AnyTrait[]
  readonly [selectorBrand]: true
}

export interface EventSelector extends CompiledRequirements {
  readonly id: number
  readonly kind: EventKind
  readonly observed: readonly AnyTrait[]
  readonly required: readonly AnyTrait[]
  readonly [eventSelectorBrand]: true
}

export interface ChangedSelectorOptions {
  readonly any: readonly [AnyTrait, ...AnyTrait[]]
  readonly all?: readonly AnyTrait[]
}

let nextSelectorId = 0
let nextEventSelectorId = 0

function compileRequirements(required: readonly AnyTrait[]): CompiledRequirements {
  const masksByWord: number[] = []
  for (const handle of required) {
    const word = handle.id >>> 5
    masksByWord[word] = (masksByWord[word] ?? 0) | (1 << (handle.id & 31))
  }

  const words: number[] = []
  const masks: number[] = []
  for (let word = 0; word < masksByWord.length; word++) {
    const mask = masksByWord[word]
    if (mask === undefined) continue
    words.push(word)
    masks.push(mask)
  }
  return { masks: Object.freeze(masks), words: Object.freeze(words) }
}

export function select(first: AnyTrait, ...rest: readonly AnyTrait[]): Selector
export function select(...required: readonly AnyTrait[]): Selector {
  if (required.length === 0) {
    throw new Error('three-flatland: Selectors require at least one trait')
  }

  const stableRequired = Object.freeze([...required])
  const selector = Object.freeze({
    id: nextSelectorId++,
    required: stableRequired,
    ...compileRequirements(stableRequired),
  }) as unknown as Selector
  return selector
}

function event(kind: EventKind, observed: readonly AnyTrait[], required: readonly AnyTrait[]): EventSelector {
  if (observed.length === 0) {
    throw new Error('three-flatland: Event selectors require at least one observed trait')
  }

  const stableObserved = Object.freeze([...observed])
  const stableRequired = Object.freeze([...required])
  const selector = Object.freeze({
    id: nextEventSelectorId++,
    kind,
    observed: stableObserved,
    required: stableRequired,
    ...compileRequirements(stableRequired),
  }) as unknown as EventSelector
  return selector
}

export function added(observed: AnyTrait, ...all: readonly AnyTrait[]): EventSelector {
  return event('added', [observed], all)
}

export function removed(observed: AnyTrait, ...all: readonly AnyTrait[]): EventSelector {
  return event('removed', [observed], all)
}

export function changed({ any, all = [] }: ChangedSelectorOptions): EventSelector {
  return event('changed', any, all)
}
