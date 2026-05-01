// Shell entry point — anything that does NOT pull in @react-three/fiber,
// three, or three-flatland. Consumers that need the canvas (CanvasStage,
// ThreeLayer, AnimationPreviewPip, SpritePreview) should import them
// from `@three-flatland/preview/canvas` so they can be code-split via
// `React.lazy()` and kept out of the initial paint critical path.

export {
  useCursorStore,
  useImageData,
  useViewportController,
  type ViewportController,
} from './CanvasContext'
export {
  canvasBackgroundStyle,
  type CanvasBackgroundStyle,
} from './canvasBackground'
export { RectOverlay, type RectOverlayProps, type Rect } from './RectOverlay'
export { useViewport, viewBoxFor, ViewportContext, type Viewport } from './Viewport'
export { InfoPanel, type InfoPanelProps, type ColorMode, type CoordMode } from './InfoPanel'
export {
  GridSliceOverlay,
  cellExtent,
  cellKey,
  gridFromCellSize,
  gridFromRowCol,
  type GridSpec,
  type GridSliceOverlayProps,
} from './GridSliceOverlay'
export { createCursorStore, useCursor, type CursorReading, type CursorStore } from './cursorStore'
export { connectedComponents, type DetectedRect, type CCLOptions } from './ccl'
export { computeThumbStyle, type ThumbStyle } from './thumbStyle'
export {
  AutoDetectOverlay,
  type AutoDetectOverlayProps,
} from './AutoDetectOverlay'
export { HoverFrameChip, type HoverFrameChipProps } from './HoverFrameChip'
export {
  createAnimationStore,
  useAnimationPlayback,
  advancePlayhead,
  type AnimationStore,
  type PlaybackSnapshot,
} from './animationStore'
export {
  DragProvider,
  useDrag,
  useDragSource,
  useDragTarget,
  type DragPayload,
  type DragSourceKind,
  type DragState,
} from './dragKit'
export {
  AnimationDrawer,
  densityForHeight,
  type AnimationDrawerProps,
  type AnimationDrawerDensity,
} from './AnimationDrawer'
export { AnimationDrawerHeader, type AnimationDrawerHeaderProps } from './AnimationDrawerHeader'
export {
  AnimationTimeline,
  groupCells,
  frameIndexToGroupIndex,
  type AnimationTimelineProps,
} from './AnimationTimeline'
export {
  AnimationRectHighlight,
  type AnimationRectHighlightProps,
} from './AnimationRectHighlight'
