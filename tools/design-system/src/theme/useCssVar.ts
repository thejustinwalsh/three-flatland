import { useEffect, useState } from 'react'

/**
 * Read a CSS custom property (e.g. `--vscode-editor-background`) off
 * `document.body` and keep it in sync as VSCode's theme changes.
 *
 * Returns the resolved value (a color string, number, etc.) trimmed,
 * or `fallback` if the variable is unset.
 */
export function useCssVar(name: string, fallback = ''): string {
  const [value, setValue] = useState<string>(() => read(name, fallback))

  useEffect(() => {
    const update = () => setValue(read(name, fallback))
    // VSCode swaps the `vscode-*` class on <body> and re-injects the
    // --vscode-* var set when the theme changes. Watching body attributes
    // catches both. We also rebind on window focus as a backstop.
    const obs = new MutationObserver(update)
    obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('focus', update)
    return () => {
      obs.disconnect()
      window.removeEventListener('focus', update)
    }
  }, [name, fallback])

  return value
}

function read(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.body).getPropertyValue(name).trim()
  return v || fallback
}
