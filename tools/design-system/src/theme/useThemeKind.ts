import { useEffect, useState } from 'react'

export type ThemeKind = 'light' | 'dark' | 'hc' | 'hc-light'

function readKind(): ThemeKind {
  if (typeof document === 'undefined') return 'dark'
  const c = document.body.classList
  if (c.contains('vscode-high-contrast-light')) return 'hc-light'
  if (c.contains('vscode-high-contrast')) return 'hc'
  if (c.contains('vscode-light')) return 'light'
  return 'dark'
}

export function useThemeKind(): ThemeKind {
  const [kind, setKind] = useState<ThemeKind>(readKind)
  useEffect(() => {
    const obs = new MutationObserver(() => setKind(readKind()))
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return kind
}
