import * as stylex from '@stylexjs/stylex'
import { useCompareController } from './CompareContext'

// JSX intrinsic for the vscode-progress-ring web component.
// The element must be registered by the consumer's entry (main.tsx) via:
//   import '@vscode-elements/elements/dist/vscode-progress-ring/index.js'
// The encode tool's main.tsx already does this.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'vscode-progress-ring': Record<string, unknown>
    }
  }
}

const styles = stylex.create({
  // Positions the spinner in the center of the RIGHT half of the canvas
  // (the side that shows the encoded result). The spinner's left position
  // is driven by an inline style computed from splitU at render time.
  container: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  spinner: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  },
})

/**
 * HTML overlay that shows a `<vscode-progress-ring>` centered over the
 * compare (right) side of the canvas while `compareLoading` is true.
 *
 * Mount as a child of `<CanvasStage compareImageSource={...}>`. Reads
 * `loading` and `splitU` from CompareContext so the spinner tracks the
 * midpoint of the compare side as the slider moves:
 *
 *   splitU = 0 → compare side fills the canvas, midpoint = 50%
 *   splitU = 0.5 → compare side spans 50..100%, midpoint = 75%
 *   splitU = 1 → compare side has zero width; spinner pushed off-canvas
 *
 * No-ops when used outside compare mode (useCompareController returns null)
 * or when `loading` is false — safe to mount unconditionally alongside
 * `<CompareSliderOverlay />`.
 */
export function CompareLoadingOverlay() {
  const controller = useCompareController()
  if (!controller || !controller.loading) return null

  // Midpoint of the compare side in [0..1] canvas space.
  // (splitU + 1) / 2 gives the midpoint between splitU and 1.
  const compareMidpoint = (controller.splitU + 1) / 2

  return (
    <div {...stylex.props(styles.container)}>
      <div
        {...stylex.props(styles.spinner)}
        style={{ left: `${compareMidpoint * 100}%` }}
      >
        <vscode-progress-ring />
      </div>
    </div>
  )
}
