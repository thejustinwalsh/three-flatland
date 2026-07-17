import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Texture } from 'three'
import { AnimatedSprite2D } from './AnimatedSprite2D'
import { AlphaMap } from '../events/AlphaMap'
import type { SpriteSheet, SpriteFrame } from './types'

describe('AnimatedSprite2D', () => {
  let spriteSheet: SpriteSheet
  let frames: Map<string, SpriteFrame>

  beforeEach(() => {
    const texture = new Texture()
    // Mock the image property
    Object.defineProperty(texture, 'image', {
      value: { width: 128, height: 128 },
      writable: true,
    })

    frames = new Map([
      [
        'idle_0',
        {
          name: 'idle_0',
          x: 0,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      ],
      [
        'idle_1',
        {
          name: 'idle_1',
          x: 0.25,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      ],
      [
        'walk_0',
        {
          name: 'walk_0',
          x: 0,
          y: 0.25,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      ],
      [
        'walk_1',
        {
          name: 'walk_1',
          x: 0.25,
          y: 0.25,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      ],
    ])

    spriteSheet = {
      texture,
      frames,
      width: 128,
      height: 128,
      getFrame(name) {
        const frame = this.frames.get(name)
        if (!frame) throw new Error(`Frame not found: ${name}`)
        return frame
      },
      getFrameNames() {
        return Array.from(this.frames.keys())
      },
    }
  })

  // A sheet carrying named animations as `SpriteSheetLoader` would emit them
  // from `meta.animations` / Aseprite `frameTags`.
  const sheetWithAnimations = (): SpriteSheet => ({
    ...spriteSheet,
    animations: new Map([
      ['idle', { frames: ['idle_0', 'idle_1'], fps: 8, loop: true, pingPong: false }],
      ['walk', { frames: ['walk_0', 'walk_1'], fps: 12, loop: true, pingPong: false }],
    ]),
  })

  it('derives animations from sheet.animations when no animationSet is given', () => {
    const sprite = new AnimatedSprite2D({ spriteSheet: sheetWithAnimations() })
    expect(sprite.controller.getAnimationNames().sort()).toEqual(['idle', 'walk'])
  })

  it('derives animations from sheet.animations via the spriteSheet setter', () => {
    const sprite = new AnimatedSprite2D()
    sprite.spriteSheet = sheetWithAnimations()
    expect(sprite.controller.getAnimationNames()).toContain('idle')
  })

  it('explicit animationSet takes precedence over sheet.animations', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet: sheetWithAnimations(),
      animationSet: { animations: { custom: { frames: ['idle_0'], fps: 5 } } },
    })
    const names = sprite.controller.getAnimationNames()
    expect(names).toContain('custom')
    expect(names).not.toContain('walk')
  })

  it('should create with animation set', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
          walk: { frames: ['walk_0', 'walk_1'], fps: 12 },
        },
      },
    })

    expect(sprite.controller.getAnimationNames()).toContain('idle')
    expect(sprite.controller.getAnimationNames()).toContain('walk')
    sprite.dispose()
  })

  it('should play animation', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
    })

    sprite.play('idle')
    expect(sprite.isPlaying('idle')).toBe(true)
    expect(sprite.currentAnimation).toBe('idle')
    sprite.dispose()
  })

  it('should auto-play first animation', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
      autoPlay: true,
    })

    expect(sprite.isPlaying('idle')).toBe(true)
    sprite.dispose()
  })

  it('should not auto-play when disabled', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
      autoPlay: false,
    })

    expect(sprite.isPlaying()).toBe(false)
    sprite.dispose()
  })

  it('should play specific animation on creation', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
          walk: { frames: ['walk_0', 'walk_1'], fps: 12 },
        },
      },
      animation: 'walk',
    })

    expect(sprite.currentAnimation).toBe('walk')
    sprite.dispose()
  })

  it('should update frame on tick', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 10 }, // 100ms per frame
        },
      },
      animation: 'idle',
    })

    const initialFrame = sprite.frame
    sprite.update(150) // Should advance to frame 1
    expect(sprite.frame).not.toBe(initialFrame)
    sprite.dispose()
  })

  it('should pause and resume', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 10 },
        },
      },
      animation: 'idle',
    })

    sprite.pause()
    const state = sprite.controller.getState()
    expect(state.paused).toBe(true)

    sprite.resume()
    const resumedState = sprite.controller.getState()
    expect(resumedState.paused).toBe(false)
    sprite.dispose()
  })

  it('should stop animation', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
      animation: 'idle',
    })

    sprite.stop()
    expect(sprite.isPlaying()).toBe(false)
    sprite.dispose()
  })

  it('should go to specific frame', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
      animation: 'idle',
    })

    sprite.gotoFrame(1)
    expect(sprite.frame?.name).toBe('idle_1')
    sprite.dispose()
  })

  it('should get/set speed', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 8 },
        },
      },
    })

    expect(sprite.speed).toBe(1)
    sprite.speed = 2
    expect(sprite.speed).toBe(2)
    sprite.dispose()
  })

  it('should get animation duration', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'], fps: 10 }, // 2 frames at 10fps = 200ms
        },
      },
      animation: 'idle',
    })

    expect(sprite.getAnimationDuration()).toBe(200)
    sprite.dispose()
  })

  it('should add animation from frame names', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
    })

    sprite.addAnimationFromFrames('idle', ['idle_0', 'idle_1'], { fps: 8 })
    expect(sprite.controller.getAnimationNames()).toContain('idle')
    sprite.dispose()
  })

  it('should throw when adding animation from missing frames', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
    })

    expect(() => sprite.addAnimationFromFrames('bad', ['nonexistent'], { fps: 8 })).toThrow(
      'Frame not found: nonexistent'
    )
    sprite.dispose()
  })

  it('should warn when loading animation set with missing frames', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          bad: { frames: ['nonexistent'], fps: 8 },
        },
      },
    })

    expect(warnSpy).toHaveBeenCalledWith('Frame not found in spritesheet: nonexistent')
    warnSpy.mockRestore()
    sprite.dispose()
  })

  it('should clone correctly', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'] },
        },
      },
      animation: 'idle',
    })

    sprite.position.set(100, 200, 0)
    sprite.alpha = 0.5

    const cloned = sprite.clone()
    expect(cloned.controller.getAnimationNames()).toContain('idle')
    expect(cloned.currentAnimation).toBe('idle')
    expect(cloned.position.x).toBe(100)
    expect(cloned.alpha).toBe(0.5)

    sprite.dispose()
    cloned.dispose()
  })

  it('should get spritesheet', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
    })

    expect(sprite.spriteSheet).toBe(spriteSheet)
    sprite.dispose()
  })

  it('should set new spritesheet', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
    })

    const newTexture = new Texture()
    const newSpriteSheet: SpriteSheet = {
      texture: newTexture,
      frames: new Map(),
      width: 64,
      height: 64,
      getFrame() {
        throw new Error('not found')
      },
      getFrameNames() {
        return []
      },
    }

    sprite.spriteSheet = newSpriteSheet
    expect(sprite.spriteSheet).toBe(newSpriteSheet)
    expect(sprite.texture).toBe(newTexture)
    sprite.dispose()
  })

  it('should dispose correctly', () => {
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: {
        animations: {
          idle: { frames: ['idle_0', 'idle_1'] },
        },
      },
    })

    sprite.dispose()
    expect(sprite.controller.getAnimationNames()).toHaveLength(0)
  })

  it('should create without options for R3F compatibility', () => {
    const sprite = new AnimatedSprite2D()
    expect(sprite).toBeInstanceOf(AnimatedSprite2D)
    expect(sprite.spriteSheet).toBeNull()
    sprite.dispose()
  })

  it('adopts the sheet alphaMap for alpha hit-testing (spec §8.4)', () => {
    const sheetWithAlpha: SpriteSheet = {
      ...spriteSheet,
      alphaMap: new AlphaMap(new Uint8Array([255]), 1, 1),
    }
    const sprite = new AnimatedSprite2D({ spriteSheet: sheetWithAlpha })
    expect(sprite.alphaMap).toBe(sheetWithAlpha.alphaMap)
    sprite.dispose()
  })

  it('does not clobber an explicitly assigned alphaMap', () => {
    const sheetWithAlpha: SpriteSheet = {
      ...spriteSheet,
      alphaMap: new AlphaMap(new Uint8Array([255]), 1, 1),
    }
    const mine = new AlphaMap(new Uint8Array([0]), 1, 1)
    const sprite = new AnimatedSprite2D({})
    sprite.alphaMap = mine
    sprite.spriteSheet = sheetWithAlpha
    expect(sprite.alphaMap).toBe(mine)
    sprite.dispose()
  })

  it('updates a sheet-inherited alphaMap when swapping to a new sheet', () => {
    const alphaMapA = new AlphaMap(new Uint8Array([255]), 1, 1)
    const alphaMapB = new AlphaMap(new Uint8Array([128]), 1, 1)
    const sheetA: SpriteSheet = { ...spriteSheet, alphaMap: alphaMapA }
    const sheetB: SpriteSheet = {
      texture: new Texture(),
      frames: new Map(),
      width: 64,
      height: 64,
      alphaMap: alphaMapB,
      getFrame() {
        throw new Error('not found')
      },
      getFrameNames() {
        return []
      },
    }
    const sprite = new AnimatedSprite2D({ spriteSheet: sheetA })
    expect(sprite.alphaMap).toBe(alphaMapA)
    sprite.spriteSheet = sheetB
    expect(sprite.alphaMap).toBe(alphaMapB)
    sprite.dispose()
  })

  it('preserves an explicitly user-set alphaMap across a sheet swap', () => {
    const sheetWithAlpha: SpriteSheet = {
      ...spriteSheet,
      alphaMap: new AlphaMap(new Uint8Array([255]), 1, 1),
    }
    const mine = new AlphaMap(new Uint8Array([0]), 1, 1)
    const sprite = new AnimatedSprite2D()
    sprite.alphaMap = mine
    sprite.spriteSheet = sheetWithAlpha
    expect(sprite.alphaMap).toBe(mine)
    sprite.dispose()
  })

  it('keeps a user override set after inheriting, across a later sheet swap', () => {
    const alphaMapA = new AlphaMap(new Uint8Array([255]), 1, 1)
    const alphaMapB = new AlphaMap(new Uint8Array([128]), 1, 1)
    const mine = new AlphaMap(new Uint8Array([0]), 1, 1)
    const sheetA: SpriteSheet = { ...spriteSheet, alphaMap: alphaMapA }
    const sheetB: SpriteSheet = {
      texture: new Texture(),
      frames: new Map(),
      width: 64,
      height: 64,
      alphaMap: alphaMapB,
      getFrame() {
        throw new Error('not found')
      },
      getFrameNames() {
        return []
      },
    }
    const sprite = new AnimatedSprite2D({ spriteSheet: sheetA })
    expect(sprite.alphaMap).toBe(alphaMapA) // inherited from sheetA
    sprite.alphaMap = mine // user overrides the inherited map
    expect(sprite.alphaMap).toBe(mine)
    sprite.spriteSheet = sheetB // swap must not clobber the override
    expect(sprite.alphaMap).toBe(mine)
    sprite.dispose()
  })

  it('re-resolves the active frame against the new sheet on swap (matching name)', () => {
    const sprite = new AnimatedSprite2D({ spriteSheet })
    sprite.setFrame(spriteSheet.getFrame('walk_0'))
    expect(sprite.frame).toBe(spriteSheet.frames.get('walk_0'))

    // A repack of the same atlas: 'walk_0' now lives at a different UV
    // rect. The sprite must pick up the NEW rect, not keep sampling the
    // new texture through the OLD (now-wrong) UVs.
    const repackedWalk0: SpriteFrame = {
      name: 'walk_0',
      x: 0.5,
      y: 0.5,
      width: 0.1,
      height: 0.1,
      sourceWidth: 16,
      sourceHeight: 16,
    }
    const newTexture = new Texture()
    const newSheet: SpriteSheet = {
      texture: newTexture,
      frames: new Map([['walk_0', repackedWalk0]]),
      width: 64,
      height: 64,
      getFrame(name) {
        const frame = this.frames.get(name)
        if (!frame) throw new Error(`Frame not found: ${name}`)
        return frame
      },
      getFrameNames() {
        return Array.from(this.frames.keys())
      },
    }

    sprite.spriteSheet = newSheet
    expect(sprite.texture).toBe(newTexture)
    expect(sprite.frame).toBe(repackedWalk0)
    sprite.dispose()
  })

  it("falls back to the new sheet's first frame when the active frame name is absent", () => {
    const sprite = new AnimatedSprite2D({ spriteSheet })
    sprite.setFrame(spriteSheet.getFrame('walk_0'))
    expect(sprite.frame).toBe(spriteSheet.frames.get('walk_0'))

    // The new sheet doesn't have a 'walk_0' at all — a stale old-atlas
    // rect sampled against the new texture is strictly worse than
    // resetting to a valid frame in the new sheet.
    const onlyFrame: SpriteFrame = {
      name: 'only',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      sourceWidth: 8,
      sourceHeight: 8,
    }
    const newTexture = new Texture()
    const newSheet: SpriteSheet = {
      texture: newTexture,
      frames: new Map([['only', onlyFrame]]),
      width: 8,
      height: 8,
      getFrame(name) {
        const frame = this.frames.get(name)
        if (!frame) throw new Error(`Frame not found: ${name}`)
        return frame
      },
      getFrameNames() {
        return Array.from(this.frames.keys())
      },
    }

    sprite.spriteSheet = newSheet
    expect(sprite.frame).toBe(onlyFrame)
    sprite.dispose()
  })
})
