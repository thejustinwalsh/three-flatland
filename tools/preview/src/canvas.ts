// Canvas-only entry point. Re-exports the React Three Fiber–touching
// pieces of the preview package, intended to be loaded via
// `import('@three-flatland/preview/canvas')` so the three.js + R3F +
// three-flatland chunk stays out of the shell bundle.

export { CanvasStage, type CanvasStageProps } from './CanvasStage'
export { ThreeLayer, type ThreeLayerProps, type ImageSource } from './ThreeLayer'
export {
  AnimationPreviewPip,
  type AnimationPreviewPipProps,
  type AnimationPipScale,
  type PipCorner,
} from './AnimationPreviewPip'
export { SpritePreview, type SpritePreviewProps } from './SpritePreview'
