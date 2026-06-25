import { useSyncExternalStore } from 'react'

export type DeckPosition = { slideIndex: number; fragment: number }

let position: DeckPosition = { slideIndex: 0, fragment: 0 }
const listeners = new Set<() => void>()

export function getPosition(): DeckPosition {
  return position
}

export function setPosition(next: DeckPosition): void {
  if (next.slideIndex === position.slideIndex && next.fragment === position.fragment) return
  position = next
  for (const listener of listeners) listener()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePosition(): DeckPosition {
  return useSyncExternalStore(subscribe, getPosition, getPosition)
}
