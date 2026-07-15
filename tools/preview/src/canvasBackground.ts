import type { CSSProperties } from 'react'

/**
 * The "transparency grid" pattern painted behind the atlas image when the
 * user picks `'checker'` background mode. Used by `<CanvasStage>` for its
 * mounted wrapper, and by the atlas tool's lazy-load Suspense fallback so
 * there's no visible bg transition when the canvas chunk resolves.
 *
 * Two theme tokens give us automatic light/dark adaptation; ~24px tile is
 * large enough to read but small enough to feel like a transparency grid
 * rather than pixel art.
 */
const CHECKER_BACKGROUND_IMAGE =
  'conic-gradient(' +
  'var(--vscode-editorWidget-background) 90deg, ' +
  'var(--vscode-editor-background) 0 180deg, ' +
  'var(--vscode-editorWidget-background) 0 270deg, ' +
  'var(--vscode-editor-background) 0' +
  ')'

// Subtle diagonal gradient — top-left → bottom-right between the editor
// background and the widget background. Both tokens automatically adapt
// to the active theme so the gradient stays "quiet" against any palette.
// The 8% mix-tail keeps the contrast low so it reads as a wash rather
// than a feature.
const GRADIENT_BACKGROUND_IMAGE =
  'linear-gradient(' +
  '135deg, ' +
  'var(--vscode-editor-background) 0%, ' +
  'var(--vscode-editorWidget-background) 100%' +
  ')'

export type CanvasBackgroundStyle = 'solid' | 'checker' | 'gradient'

/**
 * Returns the CSS background properties for a canvas-area surface. Pass
 * the user's `prefs.background` mode plus a fallback solid color for the
 * `'solid'` case (typically the resolved `--vscode-editor-background`).
 *
 * Spread the result into a `style` prop. Returns `{}` when no styling is
 * needed (caller can spread unconditionally).
 */
export function canvasBackgroundStyle(
  mode: CanvasBackgroundStyle,
  solidColor: string,
): Pick<CSSProperties, 'backgroundColor' | 'backgroundImage' | 'backgroundSize'> {
  if (mode === 'checker') {
    return {
      backgroundColor: 'var(--vscode-editor-background)',
      backgroundImage: CHECKER_BACKGROUND_IMAGE,
      backgroundSize: '24px 24px',
    }
  }
  if (mode === 'gradient') {
    return {
      backgroundColor: 'var(--vscode-editor-background)',
      backgroundImage: GRADIENT_BACKGROUND_IMAGE,
    }
  }
  return { backgroundColor: solidColor }
}
