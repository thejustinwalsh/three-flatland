import type { Texture } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import { dot, float, mix, screenUV, select, texture, textureLevel, uv, vec2, vec3, vec4 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

export interface CompareMaterialOptions {
  compareLoading: Node<'float'>
  compareTexture: Texture | null
  material: MeshBasicNodeMaterial
  mipLevel: Node<'float'>
  primaryTexture: Texture
  split: Node<'float'>
}

/** Build the production preview comparison graph without React or a renderer. */
export function configureCompareMaterial({
  compareLoading,
  compareTexture,
  material,
  mipLevel,
  primaryTexture,
  split,
}: CompareMaterialOptions): void {
  const primaryCompressed = !!(primaryTexture as { isCompressedTexture?: boolean }).isCompressedTexture
  const primaryUV = primaryCompressed ? vec2(uv().x, float(1).sub(uv().y)) : uv()
  const primarySample = texture(primaryTexture, primaryUV)

  const compareCompressed = !!(compareTexture as { isCompressedTexture?: boolean } | null)?.isCompressedTexture
  const compareUV = compareCompressed ? vec2(uv().x, float(1).sub(uv().y)) : uv()
  const compareSample = compareTexture ? textureLevel(compareTexture, compareUV, mipLevel) : primarySample

  const luma = dot(primarySample.rgb, vec3(0.299, 0.587, 0.114))
  const grey = vec3(luma).mul(0.55)
  const desaturated = vec4(mix(primarySample.rgb, grey, 0.75), primarySample.a)
  const right = select(compareLoading.equal(1), desaturated, compareSample)

  material.colorNode = select(screenUV.x.lessThan(split), primarySample, right)
  material.needsUpdate = true
}
