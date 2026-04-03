import type { ThreeElement } from '@react-three/fiber'
import type { SkiaCanvas } from '../three/SkiaCanvas'
import type { SkiaGroup } from '../three/SkiaGroup'
import type { SkiaRect } from '../three/SkiaRect'
import type { SkiaCircle } from '../three/SkiaCircle'
import type { SkiaOval } from '../three/SkiaOval'
import type { SkiaLine } from '../three/SkiaLine'
import type { SkiaPathNode } from '../three/SkiaPathNode'
import type { SkiaTextNode } from '../three/SkiaTextNode'
import type { SkiaSVGNode } from '../three/SkiaSVGNode'
import type { SkiaPointsNode } from '../three/SkiaPointsNode'
import type { SkiaVerticesNode } from '../three/SkiaVerticesNode'
import type { SkiaImageNode } from '../three/SkiaImageNode'

declare module '@react-three/fiber' {
  interface ThreeElements {
    skiaCanvas: ThreeElement<typeof SkiaCanvas>
    skiaGroup: ThreeElement<typeof SkiaGroup>
    skiaRect: ThreeElement<typeof SkiaRect>
    skiaCircle: ThreeElement<typeof SkiaCircle>
    skiaOval: ThreeElement<typeof SkiaOval>
    skiaLine: ThreeElement<typeof SkiaLine>
    skiaPathNode: ThreeElement<typeof SkiaPathNode>
    skiaTextNode: ThreeElement<typeof SkiaTextNode>
    skiaSVGNode: ThreeElement<typeof SkiaSVGNode>
    skiaPointsNode: ThreeElement<typeof SkiaPointsNode>
    skiaVerticesNode: ThreeElement<typeof SkiaVerticesNode>
    skiaImageNode: ThreeElement<typeof SkiaImageNode>
  }
}
