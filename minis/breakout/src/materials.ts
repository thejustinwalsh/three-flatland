/**
 * Materials for game entities with TSL effects
 * Uses colorTransform for dithering and MaterialEffect for per-sprite effects
 */
import { useMemo } from 'react'
import type { Texture } from 'three'
import {
  Sprite2DMaterial,
  bayerDither4x4,
  dissolvePixelated,
  createMaterialEffect,
  type ColorTransformFn,
} from '@three-flatland/react'
import { uv, vec2, vec3, vec4, mix, float } from 'three/tsl'
import {
  createBallTexture,
  createPaddleTexture,
  createBlockTexture,
  createNoiseTexture,
  createWallTexture,
} from './textures'
import {
  BLOCK_WIDTH,
  BLOCK_HEIGHT,
  BALL_SIZE,
  PADDLE_WIDTH,
  PADDLE_HEIGHT,
} from './systems/constants'

/**
 * Create a dither color transform with square cells for a given sprite size.
 * UV is scaled by width/height so the bayer grid is 1:1 in world units.
 * Diagonal self-shadow: light from upper-left, shadow to lower-right.
 */
function createDitherTransform(width: number, height: number): ColorTransformFn {
  // Cells per world unit — controls dither "pixel" size on screen
  const density = 20
  const cellsX = width * density
  const cellsY = height * density

  return ({ color }) => {
    const coord = uv()

    // UV scaled by sprite world-size → square dither cells, local to sprite
    const screenCoord = vec2(coord.x.mul(cellsX), coord.y.mul(cellsY))

    // Quantize UV to cell grid so shadow is constant per cell (hard on/off blocks)
    const cellUV = vec2(screenCoord.x.floor().div(cellsX), screenCoord.y.floor().div(cellsY))

    // Diagonal gradient: 0 at upper-left, 1 at lower-right
    const diag = cellUV.x.sub(cellUV.y).add(1).mul(0.5)

    // Shadow: starts dithering at 60% toward lower-right
    const shadow = diag.sub(0.40).max(0).mul(4)
    const shadowMask = bayerDither4x4(vec4(shadow, shadow, shadow, float(1)), 2, 1, screenCoord).r

    // Highlight: starts dithering at 40% toward upper-left (inverted diagonal)
    const highlight = float(1).sub(diag).sub(0.40).max(0).mul(4)
    const highlightMask = bayerDither4x4(vec4(highlight, highlight, highlight, float(1)), 2, 1, screenCoord).r

    // Combined: brighten upper-left, darken lower-right
    const brightness = float(1).add(highlightMask.mul(0.15)).sub(shadowMask.mul(0.4))
    return vec4(color.rgb.mul(brightness), color.a)
  }
}

/**
 * Flash effect for ball hit feedback.
 * Mixes sprite color with white based on `amount`.
 */
export const FlashEffect = createMaterialEffect({
  name: 'flash',
  schema: { amount: 0 } as const,
  node({ inputColor, attrs }) {
    const flashColor = vec3(1.0, 1.0, 1.0)
    const finalRGB = mix(inputColor.rgb, flashColor, attrs.amount)
    return vec4(finalRGB, inputColor.a)
  },
})

// Shared noise texture for all dissolve effects
let sharedNoiseTexture: Texture | null = null

function getNoiseTexture(): Texture {
  if (!sharedNoiseTexture) {
    sharedNoiseTexture = createNoiseTexture(32)
  }
  return sharedNoiseTexture
}

/**
 * Block dissolve effect for destruction animation.
 * Pixelated dissolve using noise texture.
 */
export const BlockDissolveEffect = createMaterialEffect({
  name: 'blockDissolve',
  schema: { progress: 0 } as const,
  node({ inputColor, attrs }) {
    // Use raw uv() for sprite-local dissolve pattern
    return dissolvePixelated(inputColor, uv(), attrs.progress, getNoiseTexture(), 8)
  },
})

/**
 * Create ball material with dithering and flash effect support.
 */
function createBallMaterial(spriteTexture: Texture): Sprite2DMaterial {
  const material = new Sprite2DMaterial({
    map: spriteTexture,
    colorTransform: createDitherTransform(BALL_SIZE, BALL_SIZE),
  })
  material.registerEffect(FlashEffect)
  return material
}

/**
 * Create block material with dithering and dissolve effect support.
 */
function createBlockMaterial(spriteTexture: Texture): Sprite2DMaterial {
  const material = new Sprite2DMaterial({
    map: spriteTexture,
    colorTransform: createDitherTransform(BLOCK_WIDTH, BLOCK_HEIGHT),
  })
  material.registerEffect(BlockDissolveEffect)
  return material
}

// Hook to create all game materials with pixelated textures
export function useGameMaterials() {
  // Create materials with pixelated textures and TSL effects
  const materials = useMemo(() => {
    const ballTex = createBallTexture()
    const paddleTex = createPaddleTexture()
    const blockTex = createBlockTexture()
    const wallTex = createWallTexture()
    return {
      ball: createBallMaterial(ballTex),
      paddle: new Sprite2DMaterial({
        map: paddleTex,
        colorTransform: createDitherTransform(PADDLE_WIDTH, PADDLE_HEIGHT),
      }),
      blocks: [createBlockMaterial(blockTex)],
      wall: new Sprite2DMaterial({ map: wallTex }),
    }
  }, [])

  return { materials }
}
