import { describe, expect, it, vi } from 'vitest'
import { Group, Scene, Texture } from 'three'
import { Flatland } from './Flatland'
import { autoRegistryFor, entityFor, worldFor } from './ecs/testUtils.type-test'
import { createMaterialEffect } from './materials/MaterialEffect'
import type { Sprite2DMaterial } from './materials/Sprite2DMaterial'
import { AnimatedSprite2D } from './sprites/AnimatedSprite2D'
import { Sprite2D } from './sprites/Sprite2D'
import type { SpriteFrame, SpriteSheet } from './sprites/types'
import { flatlandSceneSweep } from './orchestration/orchestrator'
import { peekRegistry } from './orchestration/registry'

const CloneEffect = createMaterialEffect({
  name: 'clone_adoption_reentrancy_default',
  schema: {
    vector: [0, 0, 0, 0] as const,
    padding: [0, 0, 0, 0] as const,
    tail: [0, 0] as const,
  },
  node: ({ inputColor }) => inputColor,
})

const CloneVariantEffect = createMaterialEffect({
  name: 'clone_adoption_reentrancy_variant',
  schema: {
    vector: [0, 0, 0, 0] as const,
    padding: [0, 0, 0, 0] as const,
    tail: [0, 0] as const,
    mode: () => 'authored',
  },
  node: ({ inputColor }) => inputColor,
})

type CloneKind = 'sprite' | 'animated'
type ManagedKind = 'default' | 'variant'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 32, height: 32 }
  return texture
}

function makeSheet(texture: Texture): SpriteSheet {
  const frame: SpriteFrame = {
    name: 'idle',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    sourceWidth: 32,
    sourceHeight: 32,
  }
  return {
    texture,
    frames: new Map([['idle', frame]]),
    width: 32,
    height: 32,
    getFrame: () => frame,
    getFrameNames: () => ['idle'],
  }
}

function makeManagedClone(kind: CloneKind, managed: ManagedKind, source: Flatland) {
  const texture = makeTexture()
  const sprite =
    kind === 'sprite' ? new Sprite2D({ texture }) : new AnimatedSprite2D({ spriteSheet: makeSheet(texture) })
  source.add(sprite)
  const Effect = managed === 'default' ? CloneEffect : CloneVariantEffect
  sprite.material.registerEffect(Effect)
  const effect = new Effect()
  effect.vector = [1, 2, 3, 4]
  sprite.addEffect(effect)
  return { sprite, clone: sprite.clone(), texture }
}

function spriteOwnership(flatland: Flatland, sprite: Sprite2D): boolean {
  return (Reflect.get(flatland, '_spriteOwnedMaterials') as Map<Sprite2D, Sprite2DMaterial>).has(sprite)
}

function spriteSubscriptions(flatland: Flatland, sprite: Sprite2D): boolean {
  return (
    (Reflect.get(flatland, '_spriteMaterialSubscriptions') as Map<Sprite2D, unknown>).has(sprite) ||
    (Reflect.get(flatland, '_spriteDisposeSubscriptions') as Map<Sprite2D, unknown>).has(sprite)
  )
}

describe('managed clone adoption reentrancy', () => {
  it.each([
    ['sprite', 'default', 'same', false],
    ['sprite', 'variant', 'cross', true],
    ['animated', 'default', 'cross', false],
    ['animated', 'variant', 'same', true],
  ] as const)(
    'rolls back terminalized %s %s clones in a %s-world adoption (throw=%s)',
    (kind, managed, scope, throws) => {
      const source = new Flatland()
      const destination = scope === 'same' ? source : new Flatland()
      const { sprite, clone } = makeManagedClone(kind, managed, source)
      const staging = clone.material
      const disposeStaging = vi.spyOn(staging, 'dispose')
      staging.addEventListener('dispose', () => {
        clone.dispose()
        if (throws) throw 0
      })
      const baseline = destination === source ? 1 : 0

      const notThrown = Symbol('not thrown')
      let thrown: unknown = notThrown
      try {
        destination.add(clone)
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBe(throws ? 0 : notThrown)
      expect(disposeStaging).toHaveBeenCalledTimes(1)
      expect(clone._disposed).toBe(true)
      expect(clone.material).toBe(staging)
      expect(entityFor(clone)).toBeNull()
      expect(worldFor(clone)).toBeNull()
      expect(destination.spriteGroup.spriteCount).toBe(baseline)
      expect(spriteOwnership(destination, clone)).toBe(false)
      expect(spriteSubscriptions(destination, clone)).toBe(false)
      expect((Reflect.get(destination, '_pendingChannelValidation') as Set<Sprite2D>).has(clone)).toBe(false)
      expect(() => destination.add(clone)).toThrow('Flatland.add: cannot add a disposed Sprite2D')

      if (destination !== source) destination.dispose()
      source.dispose()
      sprite.dispose()
    }
  )

  it.each([
    ['sprite', 'default', false],
    ['animated', 'variant', true],
  ] as const)('deduplicates a nested destination.add for a %s %s clone (throw=%s)', (kind, managed, throws) => {
    const source = new Flatland()
    const destination = new Flatland()
    const { sprite, clone } = makeManagedClone(kind, managed, source)
    const staging = clone.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    staging.addEventListener('dispose', () => {
      destination.add(clone)
      if (throws) throw 0
    })

    const notThrown = Symbol('not thrown')
    let thrown: unknown = notThrown
    try {
      destination.add(clone)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(throws ? 0 : notThrown)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(entityFor(clone)).not.toBeNull()
    expect(worldFor(clone)).not.toBeNull()
    expect(destination.spriteGroup.spriteCount).toBe(1)
    expect(spriteOwnership(destination, clone)).toBe(true)
    expect(spriteSubscriptions(destination, clone)).toBe(true)

    destination.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it.each([
    ['sprite', 'variant'],
    ['animated', 'default'],
  ] as const)('rolls back a %s %s clone when destination disposal reenters staging cleanup', (kind, managed) => {
    const source = new Flatland()
    const destination = new Flatland()
    const retryDestination = new Flatland()
    const { sprite, clone } = makeManagedClone(kind, managed, source)
    const staging = clone.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    staging.addEventListener('dispose', () => {
      destination.dispose()
      throw 0
    })

    let thrown: unknown = Symbol('not thrown')
    try {
      destination.add(clone)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(0)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(clone._disposed).toBe(false)
    expect(clone.material).toBe(staging)
    expect(entityFor(clone)).toBeNull()
    expect(worldFor(clone)).toBeNull()
    expect(destination.spriteGroup.spriteCount).toBe(0)
    expect(spriteOwnership(destination, clone)).toBe(false)
    expect(spriteSubscriptions(destination, clone)).toBe(false)

    expect(() => retryDestination.add(clone)).not.toThrow()
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(entityFor(clone)).not.toBeNull()
    expect(retryDestination.spriteGroup.spriteCount).toBe(1)
    expect(spriteOwnership(retryDestination, clone)).toBe(true)

    retryDestination.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it.each([
    ['sprite', 'default', false],
    ['animated', 'variant', true],
  ] as const)('replaces a terminal auto registry for a %s %s clone (throw=%s)', (kind, managed, throws) => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const { sprite, clone } = makeManagedClone(kind, managed, source)
    const staging = clone.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    let terminalRegistry = peekRegistry(renderer, scene)
    staging.addEventListener('dispose', () => {
      terminalRegistry = peekRegistry(renderer, scene)
      terminalRegistry!.group.dispose()
      if (throws) throw 0
    })
    scene.add(clone)

    const notThrown = Symbol('not thrown')
    let thrown: unknown = notThrown
    try {
      flatlandSceneSweep(renderer, scene)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(throws ? 0 : notThrown)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(terminalRegistry).not.toBeNull()
    expect(terminalRegistry!.sprites.size).toBe(0)
    expect(terminalRegistry!.standalone.size).toBe(0)
    expect(autoRegistryFor(clone)).toBeNull()
    expect(entityFor(clone)).toBeNull()
    expect(worldFor(clone)).toBeNull()
    expect(clone.material).toBe(staging)
    expect(() => worldFor(terminalRegistry!)).toThrow(/after dispose/)

    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    const recovered = peekRegistry(renderer, scene)!
    expect(recovered).not.toBe(terminalRegistry)
    expect(recovered.group).not.toBe(terminalRegistry!.group)
    expect(recovered.sprites).toEqual(new Set([clone]))
    expect(recovered.standalone).toEqual(new Set([clone]))
    expect(autoRegistryFor(clone)).toBe(recovered)
    expect(clone.material).not.toBe(staging)
    expect(disposeStaging).toHaveBeenCalledTimes(1)
    expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

    scene.remove(clone)
    recovered.group.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it('commits one coherent membership when staging cleanup re-adds the clone to the same scene', () => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const { sprite, clone } = makeManagedClone('sprite', 'default', source)
    const staging = clone.material
    const disposeStaging = vi.spyOn(staging, 'dispose')
    staging.addEventListener('dispose', () => {
      scene.add(clone)
    })
    scene.add(clone)

    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    const registry = peekRegistry(renderer, scene)!
    expect(registry.sprites).toEqual(new Set([clone]))
    expect(registry.standalone).toEqual(new Set([clone]))
    expect(autoRegistryFor(clone)).toBe(registry)
    expect(clone._pendingPrimeScene).toBeNull()
    expect(clone.parent).toBe(scene)
    expect(clone.material).not.toBe(staging)
    expect(disposeStaging).toHaveBeenCalledTimes(1)

    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    expect(registry.sprites).toEqual(new Set([clone]))
    expect(registry.standalone).toEqual(new Set([clone]))
    expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([registry.group])

    scene.remove(clone)
    registry.group.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it('does not ghost-register a detached variant clone after scene.clear throws 0 during staging cleanup', () => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const { sprite, clone } = makeManagedClone('sprite', 'variant', source)
    const staging = clone.material
    staging.addEventListener('dispose', () => {
      scene.clear()
      throw 0
    })
    scene.add(clone)

    let thrown: unknown = Symbol('not thrown')
    try {
      flatlandSceneSweep(renderer, scene)
    } catch (error) {
      thrown = error
    }

    const registry = peekRegistry(renderer, scene)!
    expect(thrown).toBe(0)
    expect(clone.parent).toBeNull()
    expect(clone.material).toBe(staging)
    expect(autoRegistryFor(clone)).toBeNull()
    expect(clone._pendingPrimeScene).toBeNull()
    expect(registry.sprites.size).toBe(0)
    expect(registry.standalone.size).toBe(0)
    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    expect(registry.sprites.size).toBe(0)
    expect(registry.standalone.size).toBe(0)
    expect(autoRegistryFor(clone)).toBeNull()

    registry.group.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it('publishes a reparented animated default clone only to its authored destination scene', () => {
    const source = new Flatland()
    const renderer = {}
    const sceneA = new Scene()
    const sceneB = new Scene()
    const { sprite, clone } = makeManagedClone('animated', 'default', source)
    const staging = clone.material
    let rejectedCandidate: Sprite2DMaterial | null = null
    staging.addEventListener('dispose', () => {
      rejectedCandidate = clone.material
      sceneB.add(clone)
      throw 0
    })
    sceneA.add(clone)

    let thrown: unknown = Symbol('not thrown')
    try {
      flatlandSceneSweep(renderer, sceneA)
    } catch (error) {
      thrown = error
    }

    const registryA = peekRegistry(renderer, sceneA)!
    expect(thrown).toBe(0)
    expect(clone.parent).toBe(sceneB)
    expect(clone.material).toBe(staging)
    expect(clone._pendingPrimeScene).toBe(sceneB)
    expect(autoRegistryFor(clone)).toBeNull()
    expect(registryA.sprites.size).toBe(0)
    expect(registryA.standalone.size).toBe(0)

    expect(() => flatlandSceneSweep(renderer, sceneB)).not.toThrow()
    const registryB = peekRegistry(renderer, sceneB)!
    expect(registryB.sprites).toEqual(new Set([clone]))
    expect(registryB.standalone).toEqual(new Set([clone]))
    expect(autoRegistryFor(clone)).toBe(registryB)
    expect(clone.material).not.toBe(staging)
    expect(clone.material).not.toBe(rejectedCandidate)
    expect(registryA.sprites.size).toBe(0)
    expect(registryA.standalone.size).toBe(0)

    sceneB.remove(clone)
    registryA.group.dispose()
    registryB.group.dispose()
    source.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it.each([
    ['sprite', 'default', false],
    ['animated', 'variant', true],
  ] as const)(
    'migrates an existing %s auto member after a %s clone terminalizes its registry (throw=%s)',
    (kind, managed, throws) => {
      const source = new Flatland()
      const renderer = {}
      const scene = new Scene()
      const { sprite, clone, texture } = makeManagedClone(kind, managed, source)
      const existing = new Sprite2D({ texture })
      if (managed === 'variant') {
        existing.material.registerEffect(CloneVariantEffect)
        existing.addEffect(new CloneVariantEffect())
      }
      scene.add(existing)
      flatlandSceneSweep(renderer, scene)

      const terminalRegistry = peekRegistry(renderer, scene)!
      const terminalMaterial = existing.material
      expect(terminalRegistry.sprites).toEqual(new Set([existing]))
      expect(terminalRegistry.standalone).toEqual(new Set([existing]))

      const staging = clone.material
      const disposeStaging = vi.spyOn(staging, 'dispose')
      staging.addEventListener('dispose', () => {
        terminalRegistry.group.dispose()
        if (throws) throw 0
      })
      scene.add(clone)

      const notThrown = Symbol('not thrown')
      let thrown: unknown = notThrown
      try {
        flatlandSceneSweep(renderer, scene)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBe(throws ? 0 : notThrown)
      expect(disposeStaging).toHaveBeenCalledTimes(1)
      expect(autoRegistryFor(existing)).toBe(terminalRegistry)
      expect(autoRegistryFor(clone)).toBeNull()
      expect(entityFor(existing)).toBeNull()
      expect(entityFor(clone)).toBeNull()

      expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
      const recovered = peekRegistry(renderer, scene)!
      expect(recovered).not.toBe(terminalRegistry)
      expect(recovered.sprites).toEqual(new Set([clone, existing]))
      expect(recovered.standalone.size).toBe(0)
      expect(recovered.group.spriteCount).toBe(2)
      expect(autoRegistryFor(existing)).toBe(recovered)
      expect(autoRegistryFor(clone)).toBe(recovered)
      expect(entityFor(existing)).not.toBeNull()
      expect(entityFor(clone)).not.toBeNull()
      expect(existing.material).not.toBe(terminalMaterial)
      expect(existing.material).toBe(clone.material)
      expect(terminalRegistry.sprites.size).toBe(0)
      expect(terminalRegistry.standalone.size).toBe(0)
      expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

      scene.remove(existing, clone)
      recovered.group.dispose()
      source.dispose()
      existing.dispose()
      clone.dispose()
      sprite.dispose()
    }
  )

  it.each([false, true])(
    'force-detaches a terminal auto group re-added by its removal callback (throw=%s)',
    (throws) => {
      const source = new Flatland()
      const renderer = {}
      const scene = new Scene()
      const { sprite, clone, texture } = makeManagedClone('sprite', 'default', source)
      const existing = new Sprite2D({ texture })
      scene.add(existing)
      flatlandSceneSweep(renderer, scene)
      const terminalRegistry = peekRegistry(renderer, scene)!
      terminalRegistry.group.addEventListener('removed', () => {
        scene.add(terminalRegistry.group)
        if (throws) throw 0
      })

      clone.material.addEventListener('dispose', () => {
        terminalRegistry.group.dispose()
      })
      scene.add(clone)
      expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()

      const notThrown = Symbol('not thrown')
      let thrown: unknown = notThrown
      try {
        flatlandSceneSweep(renderer, scene)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBe(throws ? 0 : notThrown)
      expect(terminalRegistry.group.parent).toBeNull()
      expect(scene.children).not.toContain(terminalRegistry.group)

      if (throws) expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
      const recovered = peekRegistry(renderer, scene)!
      expect(recovered).not.toBe(terminalRegistry)
      expect(recovered.sprites).toEqual(new Set([clone, existing]))
      expect(recovered.standalone.size).toBe(0)
      expect(recovered.group.spriteCount).toBe(2)
      expect(autoRegistryFor(existing)).toBe(recovered)
      expect(autoRegistryFor(clone)).toBe(recovered)
      expect(entityFor(existing)).not.toBeNull()
      expect(entityFor(clone)).not.toBeNull()
      expect(() => worldFor(recovered)).not.toThrow()
      expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

      scene.remove(existing, clone)
      recovered.group.dispose()
      source.dispose()
      existing.dispose()
      clone.dispose()
      sprite.dispose()
    }
  )

  it.each([
    ['authored descendant', false],
    ['authored descendant', true],
    ['replacement group', false],
    ['replacement group', true],
  ] as const)('force-detaches a terminal auto group nested below the %s (throw=%s)', (placement, throws) => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const authoredParent = new Group()
    scene.add(authoredParent)
    const { sprite, clone, texture } = makeManagedClone('sprite', 'default', source)
    const existing = new Sprite2D({ texture })
    scene.add(existing)
    flatlandSceneSweep(renderer, scene)
    const terminalRegistry = peekRegistry(renderer, scene)!
    let replacementAtRemoval = terminalRegistry
    terminalRegistry.group.addEventListener('removed', () => {
      replacementAtRemoval = peekRegistry(renderer, scene)!
      if (placement === 'authored descendant') authoredParent.add(terminalRegistry.group)
      else replacementAtRemoval.group.add(terminalRegistry.group)
      if (throws) throw 0
    })
    clone.material.addEventListener('dispose', () => {
      terminalRegistry.group.dispose()
    })
    scene.add(clone)
    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()

    const notThrown = Symbol('not thrown')
    let thrown: unknown = notThrown
    try {
      flatlandSceneSweep(renderer, scene)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(throws ? 0 : notThrown)
    expect(terminalRegistry.group.parent).toBeNull()
    expect(authoredParent.children).not.toContain(terminalRegistry.group)
    expect(replacementAtRemoval.group.children).not.toContain(terminalRegistry.group)

    if (throws) expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    const recovered = peekRegistry(renderer, scene)!
    expect(recovered).toBe(replacementAtRemoval)
    expect(recovered.sprites).toEqual(new Set([clone, existing]))
    expect(recovered.standalone.size).toBe(0)
    expect(recovered.group.spriteCount).toBe(2)
    expect(autoRegistryFor(existing)).toBe(recovered)
    expect(autoRegistryFor(clone)).toBe(recovered)
    expect(entityFor(existing)).not.toBeNull()
    expect(entityFor(clone)).not.toBeNull()
    expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

    scene.remove(existing, clone)
    recovered.group.dispose()
    source.dispose()
    existing.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it('preserves a terminal auto group deliberately moved outside its registry scene', () => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const foreignParent = new Group()
    const { sprite, clone, texture } = makeManagedClone('sprite', 'default', source)
    const existing = new Sprite2D({ texture })
    scene.add(existing)
    flatlandSceneSweep(renderer, scene)
    const terminalRegistry = peekRegistry(renderer, scene)!
    const moveOutside = (): void => {
      foreignParent.add(terminalRegistry.group)
    }
    terminalRegistry.group.addEventListener('removed', moveOutside)
    clone.material.addEventListener('dispose', () => {
      terminalRegistry.group.dispose()
    })
    scene.add(clone)

    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    const recovered = peekRegistry(renderer, scene)!
    expect(terminalRegistry.group.parent).toBe(foreignParent)
    expect(foreignParent.children).toContain(terminalRegistry.group)
    expect(recovered.sprites).toEqual(new Set([clone, existing]))
    expect(recovered.group.spriteCount).toBe(2)
    expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

    terminalRegistry.group.removeEventListener('removed', moveOutside)
    foreignParent.remove(terminalRegistry.group)
    scene.remove(existing, clone)
    recovered.group.dispose()
    source.dispose()
    existing.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it('carries survivors through a terminal intermediate replacement and preserves the first falsy error', () => {
    const source = new Flatland()
    const renderer = {}
    const scene = new Scene()
    const { sprite, clone, texture } = makeManagedClone('sprite', 'default', source)
    const existingA = new Sprite2D({ texture })
    const existingB = new Sprite2D({ texture })
    scene.add(existingA, existingB)
    flatlandSceneSweep(renderer, scene)
    const terminalRegistry = peekRegistry(renderer, scene)!
    const terminalMaterial = existingA.material
    let intermediate = terminalRegistry
    terminalRegistry.group.addEventListener('removed', () => {
      intermediate = peekRegistry(renderer, scene)!
      intermediate.group.dispose()
      throw 0
    })
    clone.material.addEventListener('dispose', () => {
      terminalRegistry.group.dispose()
    })
    scene.add(clone)
    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()

    let thrown: unknown = Symbol('not thrown')
    try {
      flatlandSceneSweep(renderer, scene)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(0)
    expect(intermediate).not.toBe(terminalRegistry)
    expect(intermediate._recoveryCandidates).toEqual(new Set([existingA, existingB]))
    expect(terminalRegistry.sprites.size).toBe(0)
    expect(terminalRegistry.standalone.size).toBe(0)

    expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
    const recovered = peekRegistry(renderer, scene)!
    expect(recovered).not.toBe(intermediate)
    expect(recovered.sprites).toEqual(new Set([clone, existingA, existingB]))
    expect(recovered.standalone.size).toBe(0)
    expect(recovered._recoveryCandidates.size).toBe(0)
    expect(recovered.group.spriteCount).toBe(3)
    expect(autoRegistryFor(existingA)).toBe(recovered)
    expect(autoRegistryFor(existingB)).toBe(recovered)
    expect(autoRegistryFor(clone)).toBe(recovered)
    expect(entityFor(existingA)).not.toBeNull()
    expect(entityFor(existingB)).not.toBeNull()
    expect(entityFor(clone)).not.toBeNull()
    expect(existingA.material).not.toBe(terminalMaterial)
    expect(existingA.material).toBe(existingB.material)
    expect(existingA.material).toBe(clone.material)
    expect(intermediate._recoveryCandidates.size).toBe(0)
    expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

    scene.remove(existingA, existingB, clone)
    recovered.group.dispose()
    source.dispose()
    existingA.dispose()
    existingB.dispose()
    clone.dispose()
    sprite.dispose()
  })

  it.each([false, true])(
    'stops a terminalized registry sweep before touching the remaining pending clone (throw=%s)',
    (throws) => {
      const source = new Flatland()
      const renderer = {}
      const scene = new Scene()
      const firstPair = makeManagedClone('sprite', 'default', source)
      const secondPair = makeManagedClone('animated', 'default', source)
      const firstStaging = firstPair.clone.material
      const secondStaging = secondPair.clone.material
      const disposeFirst = vi.spyOn(firstStaging, 'dispose')
      const disposeSecond = vi.spyOn(secondStaging, 'dispose')
      let terminalRegistry = peekRegistry(renderer, scene)
      firstStaging.addEventListener('dispose', () => {
        terminalRegistry = peekRegistry(renderer, scene)
        terminalRegistry!.group.dispose()
        if (throws) throw 0
      })
      scene.add(firstPair.clone, secondPair.clone)

      const notThrown = Symbol('not thrown')
      let thrown: unknown = notThrown
      try {
        flatlandSceneSweep(renderer, scene)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBe(throws ? 0 : notThrown)
      expect(disposeFirst).toHaveBeenCalledTimes(1)
      expect(disposeSecond).not.toHaveBeenCalled()
      expect(autoRegistryFor(firstPair.clone)).toBeNull()
      expect(autoRegistryFor(secondPair.clone)).toBeNull()
      expect(firstPair.clone._pendingPrimeScene).toBe(scene)
      expect(secondPair.clone._pendingPrimeScene).toBe(scene)

      expect(() => flatlandSceneSweep(renderer, scene)).not.toThrow()
      const recovered = peekRegistry(renderer, scene)!
      expect(recovered).not.toBe(terminalRegistry)
      expect(recovered.sprites).toEqual(new Set([firstPair.clone, secondPair.clone]))
      expect(autoRegistryFor(firstPair.clone)).toBe(recovered)
      expect(autoRegistryFor(secondPair.clone)).toBe(recovered)
      expect(disposeFirst).toHaveBeenCalledTimes(1)
      expect(disposeSecond).toHaveBeenCalledTimes(1)
      expect(scene.children.filter((child) => child.name === 'FlatlandOrchestrator')).toEqual([recovered.group])

      scene.remove(firstPair.clone, secondPair.clone)
      recovered.group.dispose()
      source.dispose()
      firstPair.clone.dispose()
      firstPair.sprite.dispose()
      secondPair.clone.dispose()
      secondPair.sprite.dispose()
    }
  )

  it('excludes removed, reparented, and explicitly-owned old members from terminal-registry migration', () => {
    const source = new Flatland()
    const renderer = {}
    const sceneA = new Scene()
    const sceneB = new Scene()
    const foreign = new Flatland()
    const { sprite, clone, texture } = makeManagedClone('sprite', 'default', source)
    const staying = new Sprite2D({ texture })
    const removed = new Sprite2D({ texture })
    const reparented = new Sprite2D({ texture })
    const explicitlyOwned = new Sprite2D({ texture })
    sceneA.add(staying, removed, reparented, explicitlyOwned)
    flatlandSceneSweep(renderer, sceneA)
    const terminalRegistry = peekRegistry(renderer, sceneA)!

    const staging = clone.material
    staging.addEventListener('dispose', () => {
      sceneA.remove(removed)
      sceneB.add(reparented)
      foreign.add(explicitlyOwned)
      terminalRegistry.group.dispose()
    })
    sceneA.add(clone)

    expect(() => flatlandSceneSweep(renderer, sceneA)).not.toThrow()
    expect(() => flatlandSceneSweep(renderer, sceneA)).not.toThrow()
    const recoveredA = peekRegistry(renderer, sceneA)!
    expect(recoveredA.sprites).toEqual(new Set([clone, staying]))
    expect(recoveredA.standalone.size).toBe(0)
    expect(recoveredA.group.spriteCount).toBe(2)
    expect(autoRegistryFor(clone)).toBe(recoveredA)
    expect(autoRegistryFor(staying)).toBe(recoveredA)
    expect(autoRegistryFor(removed)).toBeNull()
    expect(autoRegistryFor(reparented)).toBeNull()
    expect(autoRegistryFor(explicitlyOwned)).toBeNull()
    expect(entityFor(explicitlyOwned)).not.toBeNull()
    expect(foreign.spriteGroup.spriteCount).toBe(1)

    expect(() => flatlandSceneSweep(renderer, sceneB)).not.toThrow()
    const recoveredB = peekRegistry(renderer, sceneB)!
    expect(recoveredB.sprites).toEqual(new Set([reparented]))
    expect(autoRegistryFor(reparented)).toBe(recoveredB)
    expect(recoveredA.sprites).toEqual(new Set([clone, staying]))
    expect(terminalRegistry.sprites.size).toBe(0)
    expect(terminalRegistry.standalone.size).toBe(0)

    sceneA.remove(staying, explicitlyOwned, clone)
    sceneB.remove(reparented)
    recoveredA.group.dispose()
    recoveredB.group.dispose()
    foreign.dispose()
    source.dispose()
    staying.dispose()
    removed.dispose()
    reparented.dispose()
    explicitlyOwned.dispose()
    clone.dispose()
    sprite.dispose()
  })
})
