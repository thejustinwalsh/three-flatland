/** @jsxImportSource preact */
/**
 * Producer dropdown — custom-styled selector, since native `<select>`
 * open state is still OS-controlled in all shipping browsers (Chrome's
 * `appearance: base-select` is behind a flag).
 *
 * Closes on outside click and on Escape. The currently-selected provider
 * comes from `DevtoolsState.selectedProviderId`.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { getClient } from '../client.js'
import { useDevtoolsState } from '../hooks.js'

export function ProducerSelect() {
  const state = useDevtoolsState()
  const client = getClient()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = state.providers.find((p) => p.id === state.selectedProviderId) ?? null
  const label = selected !== null ? selected.name : 'No producer'

  return (
    <div class="producer-select" ref={rootRef}>
      <button
        type="button"
        class={`producer-button${open ? ' producer-button-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={state.providers.length === 0}
      >
        <span class={state.serverAlive && selected !== null ? 'dot dot-live' : 'dot'} />
        <span class="producer-label">{label}</span>
        {selected !== null && <span class="producer-kind">{selected.kind}</span>}
        <span class="producer-caret">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul class="producer-menu">
          {state.providers.length === 0 ? (
            <li class="panel-empty">No producers announced.</li>
          ) : (
            state.providers.map((p) => {
              const active = p.id === state.selectedProviderId
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    class={`producer-option${active ? ' producer-option-active' : ''}`}
                    onClick={() => {
                      client.selectProvider(p.id)
                      setOpen(false)
                    }}
                  >
                    <span class="producer-check">{active ? '✓' : ''}</span>
                    <span class="producer-label">{p.name}</span>
                    <span class="producer-kind">{p.kind}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
