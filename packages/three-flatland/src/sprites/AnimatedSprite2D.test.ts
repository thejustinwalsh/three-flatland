import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Texture } from 'three'
import { AnimatedSprite2D } from './AnimatedSprite2D'
import { AlphaMap } from '../events/AlphaMap'
import type { SpriteSheet, SpriteFrame } from './types'
import { createMaterialEffect } from '../materials/MaterialEffect'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { createWorld } from '../ecs/runtime'
import { enrollInWorld, requiredEntity, traitFor } from '../ecs/testUtils.type-test'
import { Flatland } from '../Flatland'
import { SpriteGroup } from '../pipeline/SpriteGroup'

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

  it('advances enrolled animations as one caller-owned group step', () => {
    const group = new SpriteGroup()
    const first = new AnimatedSprite2D({
      spriteSheet,
      animationSet: { animations: { idle: { frames: ['idle_0', 'idle_1'], fps: 10 } } },
      animation: 'idle',
    })
    const second = first.clone()
    group.addSprites(first, second)

    group.advanceAnimations(100)

    expect(first.controller.getState().frameIndex).toBe(1)
    expect(second.controller.getState().frameIndex).toBe(1)

    group.remove(second)
    group.advanceAnimations(100)

    expect(first.controller.getState().frameIndex).toBe(0)
    expect(second.controller.getState().frameIndex).toBe(1)

    group.dispose()
    first.dispose()
    second.dispose()
  })

  it('coalesces identical callback-free timelines behind the group boundary', () => {
    const group = new SpriteGroup()
    const sharedAnimation = {
      name: 'idle',
      frames: [{ frame: frames.get('idle_0')! }, { frame: frames.get('idle_1')! }],
      fps: 10,
      loop: true,
    }
    const first = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    const second = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    group.addSprites(first, second)
    const animationState = Reflect.get(group, '_animationState') as {
      members: AnimatedSprite2D[]
      sprites: Array<AnimatedSprite2D | null>
      spriteCount: number
      cohorts: Array<{ processedTick: number }>
      bindingCohort: Uint8Array
      bindingEntity: Float64Array
    }
    const scratch = animationState.sprites
    const bindingEntity = animationState.bindingEntity
    const bindingCohort = animationState.bindingCohort
    expect(animationState.members).toEqual([first, second])
    expect(scratch).toEqual([null, null])
    expect(animationState.cohorts).toHaveLength(32)

    group.advanceAnimations(100)

    expect(animationState.bindingEntity).toBe(bindingEntity)
    expect(animationState.bindingCohort).toBe(bindingCohort)
    expect(animationState.sprites).toBe(scratch)
    expect(animationState.sprites).toEqual([null, null])
    expect(animationState.spriteCount).toBe(0)
    expect(animationState.cohorts.filter((cohort) => cohort.processedTick > 0)).toHaveLength(1)
    expect(Array.from(bindingCohort).filter((value) => value !== 0)).toEqual([1, 1])
    expect(first.controller.getState()).toEqual(second.controller.getState())
    expect(first.frame).toBe(frames.get('idle_1'))
    expect(second.frame).toBe(frames.get('idle_1'))

    group.advanceAnimations(100)
    expect(animationState.bindingEntity).toBe(bindingEntity)
    expect(animationState.bindingCohort).toBe(bindingCohort)
    expect(animationState.sprites).toBe(scratch)
    expect(animationState.cohorts.filter((cohort) => cohort.processedTick > 0)).toHaveLength(1)
    expect(animationState.bindingEntity).toBeInstanceOf(Float64Array)

    group.dispose()
    expect(animationState.members).toHaveLength(0)
    expect(animationState.sprites).toHaveLength(0)
    expect(animationState.bindingEntity).toHaveLength(0)
    expect(animationState.bindingCohort).toHaveLength(0)
    expect(animationState.cohorts).toHaveLength(0)
    first.dispose()
    second.dispose()
  })

  it('invalidates a dense timeline binding when an entity slot is reused', () => {
    const group = new SpriteGroup()
    const sharedAnimation = {
      name: 'idle',
      frames: [{ frame: frames.get('idle_0')! }, { frame: frames.get('idle_1')! }],
      fps: 10,
      loop: true,
    }
    const retired = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    group.add(retired)
    group.advanceAnimations(100)
    const retiredEntity = requiredEntity(retired)

    group.remove(retired)
    group.update()
    group.update()
    const replacement = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    group.add(replacement)
    const replacementEntity = requiredEntity(replacement)
    expect(replacementEntity).not.toBe(retiredEntity)
    expect(replacementEntity & 0xfffff).toBe(retiredEntity & 0xfffff)

    group.advanceAnimations(100)

    expect(replacement.controller.getState()).toMatchObject({ frameIndex: 1, elapsed: 0 })
    expect(replacement.frame).toBe(frames.get('idle_1'))

    group.dispose()
    retired.dispose()
    replacement.dispose()
  })

  it('invalidates a dense timeline binding after a direct controller command', () => {
    const group = new SpriteGroup()
    const sharedAnimation = {
      name: 'idle',
      frames: [{ frame: frames.get('idle_0')! }, { frame: frames.get('idle_1')! }],
      fps: 10,
      loop: true,
    }
    const normal = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    const faster = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    group.addSprites(normal, faster)
    group.advanceAnimations(100)

    faster.speed = 2
    group.advanceAnimations(100)

    expect(normal.controller.getState()).toMatchObject({ frameIndex: 0, elapsed: 0, speed: 1 })
    expect(faster.controller.getState()).toMatchObject({ frameIndex: 1, elapsed: 0, speed: 2 })

    group.dispose()
    normal.dispose()
    faster.dispose()
  })

  it('keeps callbacks and multi-frame catch-up on the exact controller path', () => {
    const group = new SpriteGroup()
    const sharedAnimation = {
      name: 'idle',
      frames: [{ frame: frames.get('idle_0')! }, { frame: frames.get('idle_1')! }],
      fps: 10,
      loop: true,
    }
    const callback = vi.fn()
    const withCallback = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    const catchUp = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    withCallback.play('idle', { startFrame: 0, onFrame: callback })
    const callbackUpdate = vi.spyOn(withCallback.controller, 'update')
    const catchUpUpdate = vi.spyOn(catchUp.controller, 'update')
    group.addSprites(withCallback, catchUp)

    group.advanceAnimations(250)

    expect(callbackUpdate).toHaveBeenCalledOnce()
    expect(catchUpUpdate).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(withCallback.controller.getState()).toMatchObject({ frameIndex: 0, elapsed: 50 })
    expect(catchUp.controller.getState()).toMatchObject({ frameIndex: 0, elapsed: 50 })

    group.dispose()
    withCallback.dispose()
    catchUp.dispose()
  })

  it('keeps a stable frame snapshot when an animation callback removes a later member', () => {
    const group = new SpriteGroup()
    const sharedAnimation = {
      name: 'idle',
      frames: [{ frame: frames.get('idle_0')! }, { frame: frames.get('idle_1')! }],
      fps: 10,
      loop: true,
    }
    const first = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation] })
    const removed = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    const retained = new AnimatedSprite2D({ spriteSheet, animations: [sharedAnimation], animation: 'idle' })
    first.play('idle', { startFrame: 0, onFrame: () => group.remove(removed) })
    group.addSprites(first, removed, retained)

    group.advanceAnimations(100)

    expect(first.controller.getState().frameIndex).toBe(1)
    expect(removed.controller.getState().frameIndex).toBe(0)
    expect(retained.controller.getState().frameIndex).toBe(1)
    expect(group.spriteCount).toBe(2)
    expect(Reflect.get(group, '_animationState').members).toEqual([first, retained])

    group.dispose()
    first.dispose()
    removed.dispose()
    retained.dispose()
  })

  it('rejects non-finite and reentrant group animation steps', () => {
    const group = new SpriteGroup()
    const sprite = new AnimatedSprite2D({
      spriteSheet,
      animationSet: { animations: { idle: { frames: ['idle_0', 'idle_1'], fps: 10 } } },
      animation: 'idle',
    })
    sprite.play('idle', {
      startFrame: 0,
      onFrame: () => group.advanceAnimations(100),
    })
    group.add(sprite)

    expect(() => group.advanceAnimations(Number.NaN)).toThrow('SpriteGroup.advanceAnimations deltaMs must be finite')
    expect(() => group.advanceAnimations(100)).toThrow(
      'three-flatland: SpriteGroup.advanceAnimations cannot be used reentrantly'
    )

    sprite.play('idle', { startFrame: 0 })
    expect(() => group.advanceAnimations(100)).not.toThrow()

    group.dispose()
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

  it('pre-registers cloned effects and keeps vector snapshots immutable', () => {
    const Offset = createMaterialEffect({
      name: 'animated_clone_offset',
      schema: {
        offset: [0, 0] as const,
        padding0: [0, 0, 0, 0] as const,
        padding1: [0, 0, 0, 0] as const,
      },
      node: ({ inputColor }) => inputColor,
    })
    const material = new Sprite2DMaterial({ map: spriteSheet.texture, transparent: true })
    const unrelated = new AnimatedSprite2D({ spriteSheet })
    const unrelatedMaterial = unrelated.material
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()
    const sprite = new AnimatedSprite2D({ spriteSheet, material })
    const offset = new Offset()
    offset.offset = [5, 6]
    sprite.material.registerEffect(Offset)
    sprite.addEffect(offset)
    const alphaMap = new AlphaMap(new Uint8Array([255]), 1, 1)
    sprite.visible = false
    sprite.lit = true
    sprite.receiveShadows = false
    sprite.castsShadow = true
    sprite.shadowRadius = 7
    sprite.alphaMap = alphaMap
    sprite.alphaThreshold = 0.25
    sprite.hitRadius = 2
    sprite.hitTestMode = 'alpha'
    const world = createWorld()
    enrollInWorld(sprite, world)
    const store = world.store(traitFor(Offset))
    const index = world.index(requiredEntity(sprite))
    store.offset_0![index] = 7
    store.offset_1![index] = 8
    expect(offset.offset).toEqual([7, 8])

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let cloned: AnimatedSprite2D
    try {
      cloned = sprite.clone()
      expect(warning).not.toHaveBeenCalled()
      expect(cloned.material.hasEffect(Offset)).toBe(true)
      expect(cloned.material).toBe(material)
      expect(cloned.material).not.toBe(unrelatedMaterial)
      expect(cloned.material._effectTier).toBeGreaterThan(8)
      expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    } finally {
      warning.mockRestore()
    }
    const clonedOffsetEffect = cloned._effects[0] as InstanceType<typeof Offset>
    const snapshot = clonedOffsetEffect.offset
    expect(snapshot).toEqual([7, 8])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(clonedOffsetEffect.offset).toBe(snapshot)
    expect(() => {
      ;(snapshot as unknown as number[])[1] = 99
    }).toThrow(TypeError)
    expect(clonedOffsetEffect.offset).toEqual([7, 8])
    expect(cloned.visible).toBe(false)
    expect(cloned.lit).toBe(true)
    expect(cloned.receiveShadows).toBe(false)
    expect(cloned.castsShadow).toBe(true)
    expect(cloned.shadowRadius).toBe(7)
    expect(cloned.alphaMap).toBe(alphaMap)
    expect(cloned.alphaThreshold).toBe(0.25)
    expect(cloned.hitRadius).toBe(2)
    expect(cloned.hitTestMode).toBe('alpha')
    expect(unrelated.material).toBe(unrelatedMaterial)
    expect(unrelated.material.hasEffect(Offset)).toBe(false)
    expect(unrelated.material._effectTier).toBe(8)
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()
    cloned.dispose()
    unrelated.dispose()
    sprite._unenrollFromWorld()
    world.dispose()
    material.dispose()
  })

  it('preserves authored effect constants when cloned', () => {
    const ConstantEffect = createMaterialEffect({
      name: 'animated_clone_constants',
      schema: {
        amount: 0,
        variant: () => 'default',
        resource: () => ({ kind: 'default' }),
      },
      node: ({ inputColor }) => inputColor,
    })
    const resource = { kind: 'authored' }
    const effect = new ConstantEffect()
    effect.amount = 4
    effect.variant = 'authored'
    effect.resource = resource
    const sprite = new AnimatedSprite2D({ spriteSheet })
    sprite.addEffect(effect)

    const cloned = sprite.clone()
    const clonedEffect = cloned._effects[0] as InstanceType<typeof ConstantEffect>
    expect(cloned.material).toBe(sprite.material)
    expect(clonedEffect.amount).toBe(4)
    expect(clonedEffect.variant).toBe('authored')
    expect(clonedEffect.resource).toBe(resource)

    cloned.dispose()
    sprite.dispose()
  })

  it('re-resolves a registry variant clone across Flatlands with constants and authored state intact', () => {
    const VariantEffect = createMaterialEffect({
      name: 'animated_clone_cross_world_variant',
      schema: {
        offset: [0, 0] as const,
        padding0: [0, 0, 0, 0] as const,
        padding1: [0, 0, 0, 0] as const,
        variant: () => 'default',
        resource: () => ({ kind: 'default' }),
      },
      node: ({ inputColor }) => inputColor,
    })
    const unrelated = new AnimatedSprite2D({ spriteSheet })
    const unrelatedBootstrap = unrelated.material
    const sourceFlatland = new Flatland()
    const destinationFlatland = new Flatland()
    const source = new AnimatedSprite2D({ spriteSheet })
    sourceFlatland.add(source)
    const resource = { kind: 'authored' }
    const effect = new VariantEffect()
    effect.offset = [7, 8]
    effect.variant = 'authored'
    effect.resource = resource
    source.addEffect(effect)
    const alphaMap = new AlphaMap(new Uint8Array([255]), 1, 1)
    source.visible = false
    source.lit = true
    source.receiveShadows = false
    source.castsShadow = true
    source.shadowRadius = 7
    source.alphaMap = alphaMap
    source.alphaThreshold = 0.25
    source.hitRadius = 2
    source.hitTestMode = 'alpha'
    expect(source._materialWasRegistryVariant).toBe(true)

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let cloned: AnimatedSprite2D
    try {
      cloned = source.clone()
      expect(warning).not.toHaveBeenCalled()
    } finally {
      warning.mockRestore()
    }
    const bootstrapVariant = cloned.material
    const disposeStaging = vi.spyOn(bootstrapVariant, 'dispose')
    bootstrapVariant.addEventListener('dispose', () => {
      throw 0
    })
    expect(bootstrapVariant).not.toBe(source.material)
    expect(cloned._materialIsBootstrapVariant).toBe(true)
    expect(cloned._materialWasRegistryVariant).toBe(false)
    let thrown: unknown = Symbol('not thrown')
    try {
      destinationFlatland.add(cloned)
    } catch (error) {
      thrown = error
    }

    const clonedEffect = cloned._effects[0] as InstanceType<typeof VariantEffect>
    expect(thrown).toBe(0)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(cloned.material).not.toBe(bootstrapVariant)
    expect(cloned.material).not.toBe(source.material)
    expect(cloned._materialIsBootstrapVariant).toBe(false)
    expect(cloned._materialWasRegistryVariant).toBe(true)
    expect(cloned.material._effectTier).toBeGreaterThan(8)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect(clonedEffect.offset).toEqual([7, 8])
    expect(clonedEffect.variant).toBe('authored')
    expect(clonedEffect.resource).toBe(resource)
    expect(cloned.visible).toBe(false)
    expect(cloned.lit).toBe(true)
    expect(cloned.receiveShadows).toBe(false)
    expect(cloned.castsShadow).toBe(true)
    expect(cloned.shadowRadius).toBe(7)
    expect(cloned.alphaMap).toBe(alphaMap)
    expect(cloned.alphaThreshold).toBe(0.25)
    expect(cloned.hitRadius).toBe(2)
    expect(cloned.hitTestMode).toBe('alpha')
    expect(unrelated.material).toBe(unrelatedBootstrap)
    expect(unrelatedBootstrap.hasEffect(VariantEffect)).toBe(false)
    expect(unrelatedBootstrap._effectTier).toBe(8)
    expect(unrelated.geometry.getAttribute('effectBuf2')).toBeUndefined()
    expect(destinationFlatland.spriteGroup.spriteCount).toBe(1)
    expect(() => destinationFlatland.add(cloned)).not.toThrow()
    expect(disposeStaging).toHaveBeenCalledTimes(1)

    const destinationMaterial = cloned.material
    destinationMaterial.dispose()
    expect(cloned.material).not.toBe(destinationMaterial)
    expect(cloned._materialWasRegistryVariant).toBe(true)
    expect(cloned.material.hasEffect(VariantEffect)).toBe(true)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect(clonedEffect.offset).toEqual([7, 8])
    expect(clonedEffect.variant).toBe('authored')
    expect(clonedEffect.resource).toBe(resource)

    destinationFlatland.dispose()
    sourceFlatland.dispose()
    cloned.dispose()
    source.dispose()
    unrelated.dispose()
  })

  it('commits same-Flatland default clone adoption before rethrowing staging cleanup', () => {
    const WideEffect = createMaterialEffect({
      name: 'animated_clone_same_world_default',
      schema: {
        offset: [0, 0] as const,
        padding0: [0, 0, 0, 0] as const,
        padding1: [0, 0, 0, 0] as const,
      },
      node: ({ inputColor }) => inputColor,
    })
    const flatland = new Flatland()
    const source = new AnimatedSprite2D({ spriteSheet })
    flatland.add(source)
    source.material.registerEffect(WideEffect)
    source._setupInstanceAttributes()
    const effect = new WideEffect()
    effect.offset = [7, 8]
    source.addEffect(effect)
    const cloned = source.clone()
    const staging = cloned.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    staging.addEventListener('dispose', () => {
      throw 0
    })

    let thrown: unknown = Symbol('not thrown')
    try {
      flatland.add(cloned)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(0)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(cloned.material).toBe(source.material)
    expect(cloned._materialWasRegistryDefault).toBe(true)
    expect(flatland.spriteGroup.spriteCount).toBe(2)
    expect(() => flatland.add(cloned)).not.toThrow()
    expect(disposeStaging).toHaveBeenCalledTimes(1)

    const managedDefault = cloned.material
    managedDefault.dispose()
    expect(cloned.material).not.toBe(managedDefault)
    expect(cloned.material).toBe(source.material)
    expect(cloned._materialWasRegistryDefault).toBe(true)
    expect(cloned.geometry.getAttribute('effectBuf2')).toBeDefined()
    expect((cloned._effects[0] as InstanceType<typeof WideEffect>).offset).toEqual([7, 8])

    flatland.dispose()
    cloned.dispose()
    source.dispose()
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
