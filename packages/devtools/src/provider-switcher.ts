/**
 * Provider switcher — a single-row blade with ◀ / ▶ arrows + the
 * selected provider's name. Hidden while only one provider is known
 * (the common case); shown automatically whenever two or more appear
 * on the discovery bus.
 */

import type { FolderApi, Pane } from 'tweakpane'

import type { DevtoolsClient } from './devtools-client.js'

export interface ProviderSwitcherHandle {
  readonly element: HTMLElement
  dispose(): void
}

export function addProviderSwitcher(
  parent: Pane | FolderApi,
  client: DevtoolsClient,
): ProviderSwitcherHandle {
  // Separator-blade shim so the rack ordering stays correct; we swap
  // its innards for our own layout (same pattern as stats-graph / row).
  const blade = parent.addBlade({ view: 'separator' }) as unknown as {
    element: HTMLElement
    dispose(): void
  }
  const bladeEl = blade.element
  bladeEl.innerHTML = ''
  bladeEl.className = 'tp-cntv'
  bladeEl.style.cssText = 'display:none' // Hidden until >= 2 providers

  const row = document.createElement('div')
  row.style.cssText = [
    'display:grid',
    'grid-template-columns:auto 1fr auto',
    'align-items:center',
    'gap:6px',
    'height:calc(var(--cnt-usz, 20px) * 1.1)',
    'padding:0 6px',
    'font-size:12px',
    'line-height:1',
    'color:var(--tp-label-foreground-color)',
    'font-variant-numeric:tabular-nums',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';')

  const arrowStyle =
    'cursor:pointer;padding:0 4px;opacity:0.8;font-family:ui-monospace,monospace;'
  const prevBtn = document.createElement('span')
  prevBtn.textContent = '◀'
  prevBtn.style.cssText = arrowStyle
  prevBtn.setAttribute('role', 'button')
  prevBtn.setAttribute('aria-label', 'Previous provider')

  const label = document.createElement('span')
  label.style.cssText = 'text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

  const nextBtn = document.createElement('span')
  nextBtn.textContent = '▶'
  nextBtn.style.cssText = arrowStyle
  nextBtn.setAttribute('role', 'button')
  nextBtn.setAttribute('aria-label', 'Next provider')

  row.appendChild(prevBtn)
  row.appendChild(label)
  row.appendChild(nextBtn)
  bladeEl.appendChild(row)

  function step(delta: number): void {
    const providers = client.state.providers
    if (providers.length < 2) return
    const selected = client.state.selectedProviderId
    const idx = Math.max(0, providers.findIndex((p) => p.id === selected))
    const next = providers[(idx + delta + providers.length) % providers.length]!
    client.selectProvider(next.id)
  }

  prevBtn.addEventListener('click', () => step(-1))
  nextBtn.addEventListener('click', () => step(1))

  const unsubscribe = client.addListener((s) => {
    // Visibility: only when multi-provider.
    bladeEl.style.display = s.providers.length >= 2 ? '' : 'none'
    const current = s.providers.find((p) => p.id === s.selectedProviderId)
    if (current) {
      // Prefix with kind so the user can tell flatland's system provider
      // apart from a user provider with the same display name.
      label.textContent = `${current.kind}:${current.name}`
      label.title = `${current.kind}:${current.name} (${current.id.slice(0, 8)})`
    } else {
      label.textContent = '—'
      label.title = ''
    }
  })

  return {
    element: bladeEl,
    dispose() {
      unsubscribe()
      blade.dispose()
    },
  }
}
