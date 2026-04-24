import * as stylex from '@stylexjs/stylex'
import { Button } from './Button'
import { useDevReload } from '../theme/useDevReload'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'
import { z } from '../tokens/z.stylex'

const s = stylex.create({
  toast: {
    position: 'fixed',
    right: space.xxl,
    bottom: space.xxl,
    zIndex: z.toast,
    display: 'flex',
    alignItems: 'center',
    gap: space.lg,
    paddingInline: space.xl,
    paddingBlock: space.md,
    borderRadius: radius.md,
    backgroundColor: vscode.notifyBg,
    color: vscode.notifyFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.notifyBorder,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.sm,
  },
})

/**
 * Small corner toast that appears when the webview dev-watcher reports a
 * rebuild. Click Reload to pick up the new bundle, or Dismiss to keep
 * hacking. No auto-reload — user controls it.
 *
 * Place once at the top of each tool's <App /> so every webview in the
 * suite gets the same affordance.
 */
export function DevReloadToast() {
  const { pending, reload, dismiss } = useDevReload()
  if (!pending) return null
  return (
    <div {...stylex.props(s.toast)} role="status" aria-live="polite">
      <span {...stylex.props(s.label)}>
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
