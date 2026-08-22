import { afterEach, describe, expect, it } from 'vitest'
import { Flatland } from '../Flatland'
import { AnimatedSprite2D } from '../sprites/AnimatedSprite2D'
import { TextureConfig, resolveTextureOptions } from '../loaders/texturePresets'
import { Sprite2D } from '../sprites/Sprite2D'
import { TileMap2D } from '../tilemap/TileMap2D'
import { PixelPerfectCamera } from '../cameras/PixelPerfectCamera'
import { FlatlandConfig } from './FlatlandConfig'
import { RenderingConfig } from './RenderingConfig'

afterEach(() => {
  FlatlandConfig.reset()
  RenderingConfig.reset()
  TextureConfig.reset()
  Flatland.options = undefined
  Sprite2D.options = undefined
  TileMap2D.options = undefined
})

describe('FlatlandConfig hierarchy', () => {
  it('defaults the complete pipeline to the pixel-art preset', () => {
    expect(FlatlandConfig.options).toBe('pixel-art')
    expect(new Flatland().camera).toBeInstanceOf(PixelPerfectCamera)
    expect(new Sprite2D().pixelPerfect).toBe(true)
    expect(new TileMap2D().pixelPerfect).toBe(true)
    expect(resolveTextureOptions()).toBe('pixel-art')
  })

  it('cascades the smooth preset into presentation and texture loading', () => {
    FlatlandConfig.options = 'smooth'

    expect(new Flatland().camera).not.toBeInstanceOf(PixelPerfectCamera)
    expect(new Sprite2D().pixelPerfect).toBe(false)
    expect(new TileMap2D().pixelPerfect).toBe(false)
    expect(resolveTextureOptions()).toBe('smooth')
  })

  it('keeps explicit instance values at the highest priority', () => {
    FlatlandConfig.options = 'pixel-art'

    expect(new Flatland({ pixelPerfect: false }).camera).not.toBeInstanceOf(PixelPerfectCamera)
    expect(new Sprite2D({ pixelPerfect: false }).pixelPerfect).toBe(false)
    expect(new TileMap2D({ pixelPerfect: false }).pixelPerfect).toBe(false)
  })

  it('resolves class defaults between instance and project defaults', () => {
    Flatland.options = 'smooth'
    Sprite2D.options = 'smooth'
    TileMap2D.options = 'smooth'

    expect(new Flatland().pixelPerfect).toBe(false)
    expect(new Sprite2D().pixelPerfect).toBe(false)
    expect(new AnimatedSprite2D().pixelPerfect).toBe(false)
    expect(new TileMap2D().pixelPerfect).toBe(false)
    expect(new Flatland({ pixelPerfect: true }).pixelPerfect).toBe(true)
    expect(new Sprite2D({ pixelPerfect: true }).pixelPerfect).toBe(true)
    expect(new TileMap2D({ pixelPerfect: true }).pixelPerfect).toBe(true)
  })

  it('allows TextureConfig to specialize the cascaded texture default', () => {
    FlatlandConfig.options = 'smooth'
    TextureConfig.options = 'pixel-art'

    expect(resolveTextureOptions()).toBe('pixel-art')
    expect(new Sprite2D().pixelPerfect).toBe(false)
  })

  it('does not mutate existing objects when the project preset changes', () => {
    const sprite = new Sprite2D()
    FlatlandConfig.options = 'smooth'

    expect(sprite.pixelPerfect).toBe(true)
    expect(new Sprite2D().pixelPerfect).toBe(false)
  })

  it('allows RenderingConfig to specialize presentation without changing textures', () => {
    FlatlandConfig.options = 'pixel-art'
    RenderingConfig.options = 'smooth'

    expect(new Flatland().pixelPerfect).toBe(false)
    expect(new Sprite2D().pixelPerfect).toBe(false)
    expect(resolveTextureOptions()).toBe('pixel-art')
  })

  it('merges a partial root setting over the coordinated system preset', () => {
    FlatlandConfig.options = { texture: 'smooth' }

    expect(new Sprite2D().pixelPerfect).toBe(true)
    expect(resolveTextureOptions()).toBe('smooth')
  })

  it('returns to the root branch when subsystem overrides reset', () => {
    FlatlandConfig.options = 'smooth'
    RenderingConfig.options = 'pixel-art'
    TextureConfig.options = 'pixel-art'

    RenderingConfig.reset()
    TextureConfig.reset()

    expect(new Sprite2D().pixelPerfect).toBe(false)
    expect(resolveTextureOptions()).toBe('smooth')
  })
})
