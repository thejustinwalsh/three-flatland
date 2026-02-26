import { vec2 } from 'three/tsl'

type TSLNode = any

/**
 * Convert world position to UV [0,1] space.
 * worldPos.sub(offset).div(size)
 */
export const worldToUV = (worldPos: TSLNode, occSize: TSLNode, occOffset: TSLNode): TSLNode => {
  return vec2(worldPos).sub(occOffset).div(occSize)
}

/**
 * Convert UV [0,1] space to world position.
 * uv.mul(size).add(offset)
 */
export const uvToWorld = (uvPos: TSLNode, occSize: TSLNode, occOffset: TSLNode): TSLNode => {
  return vec2(uvPos).mul(occSize).add(occOffset)
}
