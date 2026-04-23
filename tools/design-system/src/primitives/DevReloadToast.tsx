import type { CSSProperties } from 'react'
import { Button } from './Button'
import { useDevReload } from '../theme/useDevReload'

/**
 * Small corner toast that appears when the webview dev-watcher reports a
 * rebuild. Click Reload to pick up the new bundle, or Dismiss to keep
 * hacking. No auto-reload — user controls it.
 *
 * Place once at the top of each tool's <App /> so every webview in the
 * suite gets the same affordance.
 */
const toastStyle: CSSProperties = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 999,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px 6px 12px',
  borderRadius: 3,
  background: 'var(--vscode-notifications-background, var(--vscode-editorWidget-background))',
  color: 'var(--vscode-notifications-foreground, var(--vscode-foreground))',
  border: '1px solid var(--vscode-notifications-border, var(--vscode-focusBorder, transparent))',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: 'var(--vscode-font-size)',
}

const labelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  paddingRight: 4,
}

export function DevReloadToast() {
  const { pending, reload, dismiss } = useDevReload()
  if (!pending) return null
  return (
    <div style={toastStyle} role="status" aria-live="polite">
      <span style={labelStyle}>
        <i className="codicon codicon-zap" aria-hidden="true" />
        Webview rebuilt
      </span>
      <Button onClick={reload}>Reload</Button>
      <Button secondary onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  )
}
