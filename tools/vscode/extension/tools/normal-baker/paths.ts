// Pure sidecar path-derivation — split out of sidecar.ts so unit tests can
// exercise it without importing `vscode` at module scope. `vscode` is not a
// real installable package outside the extension host (only `@types/vscode`
// ships types; the runtime module is injected by VS Code's own extension
// host loader) — any file that does `import * as vscode from 'vscode'`
// throws "Cannot find module 'vscode'" the instant plain vitest imports it,
// even if none of its vscode.* exports are actually called. Same reasoning
// as `webview/normal-baker/sliderMath.ts`'s split from `Slider.tsx` for the
// StyleX transform.

export function normalJsonPath(pngPath: string): string {
  return pngPath.replace(/\.png$/i, '.normal.json')
}

export function normalPngPath(pngPath: string): string {
  return pngPath.replace(/\.png$/i, '.normal.png')
}
