import * as stylex from '@stylexjs/stylex'

export const vscode = stylex.defineVars({
  // surfaces
  // Note: panelBg intentionally maps to --vscode-editorWidget-background (floating
  // widget chrome inside a webview), not --vscode-panel-background (the editor's
  // bottom dock area). Different colors in many themes; widget background is the
  // correct surface for our Panel primitive.
  fg: 'var(--vscode-foreground)',
  bg: 'var(--vscode-editor-background)',
  panelBg: 'var(--vscode-editorWidget-background)',
  panelBorder: 'var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  panelTitleFg: 'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))',
  // state
  focusRing: 'var(--vscode-focusBorder)',
  descriptionFg: 'var(--vscode-descriptionForeground)',
  // buttons (kept for any custom Button extension; the thin wrapper itself doesn't read these)
  btnBg: 'var(--vscode-button-background)',
  btnFg: 'var(--vscode-button-foreground)',
  btnHoverBg: 'var(--vscode-button-hoverBackground)',
  btnBorder: 'var(--vscode-button-border, transparent)',
  // inputs
  inputBg: 'var(--vscode-input-background)',
  inputFg: 'var(--vscode-input-foreground)',
  inputBorder: 'var(--vscode-input-border, var(--vscode-editorWidget-border, transparent))',
  // notifications (DevReloadToast)
  notifyBg: 'var(--vscode-notifications-background, var(--vscode-editorWidget-background))',
  notifyFg: 'var(--vscode-notifications-foreground, var(--vscode-foreground))',
  notifyBorder: 'var(--vscode-notifications-border, var(--vscode-focusBorder, transparent))',
  // list / tree (Atlas frame list selection)
  listActiveSelectionBg: 'var(--vscode-list-activeSelectionBackground, transparent)',
  listActiveSelectionFg: 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))',
  // input validation (Atlas save error toast)
  errorBg: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
  errorFg: 'var(--vscode-inputValidation-errorForeground, #ffb3b3)',
  errorBorder: 'var(--vscode-inputValidation-errorBorder, transparent)',
  // type
  fontFamily: 'var(--vscode-font-family)',
  fontSize: 'var(--vscode-font-size)',
  monoFontFamily: 'var(--vscode-editor-font-family)',
})
