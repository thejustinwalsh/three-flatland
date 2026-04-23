export const vscodeTokens = {
  fg: 'var(--vscode-foreground)',
  bg: 'var(--vscode-editor-background)',
  muted: 'var(--vscode-descriptionForeground)',
  border: 'var(--vscode-input-border, var(--vscode-editorWidget-border))',
  focus: 'var(--vscode-focusBorder)',
  btnBg: 'var(--vscode-button-background)',
  btnFg: 'var(--vscode-button-foreground)',
  btnHover: 'var(--vscode-button-hoverBackground)',
  btnBorder: 'var(--vscode-button-border, transparent)',
  inputBg: 'var(--vscode-input-background)',
  inputFg: 'var(--vscode-input-foreground)',
  panelBg: 'var(--vscode-editorWidget-background)',
  panelBorder: 'var(--vscode-editorWidget-border)',
  toolbarBg: 'var(--vscode-editorWidget-background)',
  fontFamily: 'var(--vscode-font-family)',
  fontSize: 'var(--vscode-font-size)',
  monoFontFamily: 'var(--vscode-editor-font-family)',
} as const

export type VscodeTokens = typeof vscodeTokens
