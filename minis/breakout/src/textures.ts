/**
 * Pixelated Canvas textures for game sprites
 * Creates retro-style pixel art sprites using CanvasTexture
 */
import { CanvasTexture, NearestFilter, SRGBColorSpace, RepeatWrapping } from 'three'

/**
 * Create a pixelated ball sprite (8x8 circle)
 */
export function createBallTexture(): CanvasTexture {
  const size = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Clear
  ctx.clearRect(0, 0, size, size)

  // Draw pixelated circle (manually for crisp edges)
  ctx.fillStyle = '#ffffff'
  // 8x8 circle pattern
  const pixels = [
    '  ####  ',
    ' ###### ',
    '########',
    '########',
    '########',
    '########',
    ' ###### ',
    '  ####  ',
  ]
  pixels.forEach((row, y) => {
    row.split('').forEach((pixel, x) => {
      if (pixel === '#') {
        ctx.fillRect(x, y, 1, 1)
      }
    })
  })

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}

/**
 * Create a pixelated paddle sprite (16x4 rounded rectangle)
 */
export function createPaddleTexture(): CanvasTexture {
  const width = 16
  const height = 4
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, width, height)

  // Draw pixelated rounded rect
  ctx.fillStyle = '#ffffff'
  // 16x4 paddle pattern with rounded ends
  const pixels = [
    ' ############## ',
    '################',
    '################',
    ' ############## ',
  ]
  pixels.forEach((row, y) => {
    row.split('').forEach((pixel, x) => {
      if (pixel === '#') {
        ctx.fillRect(x, y, 1, 1)
      }
    })
  })

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}

/**
 * Create a pixelated block sprite (8x4 rectangle with border)
 */
export function createBlockTexture(): CanvasTexture {
  const width = 8
  const height = 4
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, width, height)

  // Flat white fill — dither shader handles shading
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}

/**
 * Create a simple noise texture for dissolve effect
 */
export function createNoiseTexture(size: number = 64): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  // Generate random noise
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.random() * 255
    data[i] = value // R
    data[i + 1] = value // G
    data[i + 2] = value // B
    data[i + 3] = 255 // A
  }

  ctx.putImageData(imageData, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.generateMipmaps = false
  return texture
}

/**
 * Create a solid-color texture tile
 */
function createSolidTexture(color: string, size = 4): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}

/**
 * Create a simple wall/background tile
 */
export function createWallTexture(): CanvasTexture {
  return createSolidTexture('#1a1a3e')
}

/**
 * Create background texture (semi-transparent so page gradient shows through)
 */
export function createBackgroundTexture(): CanvasTexture {
  const size = 4
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(10, 10, 35, 0.65)'
  ctx.fillRect(0, 0, size, size)

  const texture = new CanvasTexture(canvas)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}
