import { CanvasStage, type CanvasStageProps } from './CanvasStage'

export type SpritePreviewProps = Pick<
  CanvasStageProps,
  'imageUri' | 'background' | 'fitMargin' | 'onImageReady'
>

/**
 * Bare image preview — no overlays. Convenience wrapper around
 * <CanvasStage> for callers that just want to render a sprite without
 * composing editor UI on top of it.
 */
export function SpritePreview(props: SpritePreviewProps) {
  return <CanvasStage {...props} />
}
