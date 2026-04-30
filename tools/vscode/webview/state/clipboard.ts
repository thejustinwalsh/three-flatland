// Per-tool clipboard slot. Each tool defines its own value type and
// owns its slot instance. This is a foundation — copy/paste UX (Cmd+C,
// Cmd+V keybindings, host-side native-clipboard bridging) is wired up
// per tool when needed. Today no tool consumes it; the abstraction is
// placed here so the next tool that needs copy/paste has a shared
// idiom rather than reinventing.

export type ClipboardSlot<T> = {
  read: () => T | null
  write: (value: T | null) => void
  subscribe: (cb: () => void) => () => void
}

export function createClipboardSlot<T>(initial: T | null = null): ClipboardSlot<T> {
  let value: T | null = initial
  const listeners = new Set<() => void>()
  return {
    read: () => value,
    write: (v) => {
      value = v
      listeners.forEach((l) => l())
    },
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }
}
