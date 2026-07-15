import * as stylex from '@stylexjs/stylex'

// VS Code's text-link theme colors — vscode-theme.stylex has no link
// tokens yet, so this bridges them locally (same defineVars-over-host-vars
// pattern as the design system's own token files). Promotion candidate:
// fold into tools/design-system/src/tokens/vscode-theme.stylex.ts as
// `linkFg` / `linkActiveFg` when a second tool needs a link.
export const link = stylex.defineVars({
  fg: 'var(--vscode-textLink-foreground)',
  activeFg: 'var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground))',
})
