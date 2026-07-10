import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Group, PerspectiveCamera, Scene, Texture } from 'three'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteGroup } from '../pipeline/SpriteGroup'
import { flatlandPrime } from './orchestrator'
import { peekRegistry } from './registry'

function makeTexture(): Texture {
  const texture = new Texture()
  texture.image = { width: 8, height: 8 }
  return texture
}

function makeRenderer(): object {
  return { isFakeRenderer: true }
}

/** Drive the chained Scene.onBeforeRender exactly as three does at render time. */
function fireSceneHook(scene: Scene, renderer: object): void {
  ;(scene.onBeforeRender as unknown as (...args: unknown[]) => void).call(
    scene,
    renderer,
    scene,
    new PerspectiveCamera(),
    null
  )
}

describe('lazy materialization — dual-signal registration', () => {
  let scene: Scene
  let renderer: object
  let texture: Texture

  beforeEach(() => {
    scene = new Scene()
    renderer = makeRenderer()
    texture = makeTexture()
  })

  afterEach(() => {
    universe.reset()
  })

  it('Signal A: scene.add(sprite) primes the scene; first render call registers', () => {
    const sprite = new Sprite2D({ texture })
    scene.add(sprite)

    // Primed: chained hook replaced the prototype no-op
    const proto = Object.getPrototypeOf(scene) as Scene
    expect(scene.onBeforeRender).not.toBe(proto.onBeforeRender)
    expect(peekRegistry(renderer, scene)).toBeNull()

    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)
    expect(registry).not.toBeNull()
    expect(registry!.sprites.has(sprite)).toBe(true)
    expect(sprite._autoRegistry).toBe(registry)
    // Orchestrator group materialized into the scene
    expect(scene.children.includes(registry!.group)).toBe(true)
  })

  it('Signal A misses detached-subtree descendants; Signal B catches on first draw', () => {
    const subtree = new Group()
    const sprite = new Sprite2D({ texture })
    subtree.add(sprite) // 'added' fires — but no scene in the parent chain

    scene.add(subtree) // 'added' fires on subtree only, NOT the sprite (three gotcha)
    expect(sprite._autoRegistry).toBeNull()

    // Signal B: three calls object.onBeforeRender during the sprite's own draw
    sprite.onBeforeRender(
      renderer as never,
      scene,
      new PerspectiveCamera(),
      sprite.geometry,
      sprite.material,
      undefined as never
    )

    const registry = peekRegistry(renderer, scene)
    expect(registry).not.toBeNull()
    expect(registry!.sprites.has(sprite)).toBe(true)
  })

  it('chained hook install is idempotent across multiple sprite adds', () => {
    scene.add(new Sprite2D({ texture }))
    const installed = scene.onBeforeRender
    scene.add(new Sprite2D({ texture }))
    scene.add(new Sprite2D({ texture }))
    expect(scene.onBeforeRender).toBe(installed)

    fireSceneHook(scene, renderer)
    expect(peekRegistry(renderer, scene)!.sprites.size).toBe(3)
  })

  it("preserves the user's pre-existing scene.onBeforeRender in the chain", () => {
    const userHandler = vi.fn()
    scene.onBeforeRender = userHandler

    scene.add(new Sprite2D({ texture }))
    fireSceneHook(scene, renderer)

    expect(userHandler).toHaveBeenCalledTimes(1)
    expect(peekRegistry(renderer, scene)!.sprites.size).toBe(1)
  })

  it('re-entry safe: same scene rendered multiple times per frame', () => {
    const sprite = new Sprite2D({ texture })
    scene.add(sprite)

    fireSceneHook(scene, renderer) // main pass
    fireSceneHook(scene, renderer) // shadow / RTT / XR passes
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    expect(registry.sprites.size).toBe(1)
    expect(scene.children.filter((c) => c === registry.group).length).toBe(1)
  })

  it('re-chains when a user overwrites scene.onBeforeRender after install', () => {
    scene.add(new Sprite2D({ texture }))
    fireSceneHook(scene, renderer)

    // User clobbers the hook AFTER our install
    const userHandler = vi.fn()
    scene.onBeforeRender = userHandler

    // A later prime detects the clobber and re-chains around the user's handler
    const late = new Sprite2D({ texture })
    scene.add(late)
    fireSceneHook(scene, renderer)

    expect(userHandler).toHaveBeenCalledTimes(1)
    expect(peekRegistry(renderer, scene)!.sprites.has(late)).toBe(true)
  })

  it('sprite removed from scene unregisters', () => {
    const sprite = new Sprite2D({ texture })
    scene.add(sprite)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)!
    expect(registry.sprites.has(sprite)).toBe(true)

    scene.remove(sprite)
    expect(registry.sprites.has(sprite)).toBe(false)
    expect(sprite._autoRegistry).toBeNull()
  })

  it('sprite removed before any render call clears its pending prime', () => {
    const sprite = new Sprite2D({ texture })
    scene.add(sprite)
    scene.remove(sprite)

    fireSceneHook(scene, renderer)
    // Hook ran but nothing registered — the pending entry was cleared
    const registry = peekRegistry(renderer, scene)
    expect(registry?.sprites.size ?? 0).toBe(0)
    expect(sprite._autoRegistry).toBeNull()
  })

  it('SpriteGroup-managed sprites are never auto-registered', () => {
    const group = new SpriteGroup()
    scene.add(group)
    const sprite = new Sprite2D({ texture })
    group.add(sprite) // enrolls in the group's world

    // Even an explicit prime attempt is a no-op for explicitly-owned sprites
    flatlandPrime(scene, sprite)
    fireSceneHook(scene, renderer)

    const registry = peekRegistry(renderer, scene)
    expect(registry?.sprites.has(sprite) ?? false).toBe(false)
    expect(sprite._autoRegistry).toBeNull()

    group.dispose()
  })

  it('does not clobber an explicitly-assigned material on the auto-orchestration sweep', () => {
    // Mirrors the tsl-nodes example: construct via texture (bootstrap
    // default material), then explicitly override `.material` before the
    // sprite is ever added to a scene — the only way user code can set a
    // custom material, since Sprite2D exposes no other setter. Before the
    // fix, `_materialIsBootstrapDefault` stayed `true` (only
    // `_switchToMaterial`/`_resolveDefaultMaterial` cleared it), so
    // `registerSprite`'s auto-orchestration sweep — triggered here by the
    // scene-add + first render call — treated the sprite as still needing
    // its bootstrap default resolved and silently replaced the caller's
    // material with a shared, non-premultiplied one.
    const sprite = new Sprite2D({ texture })
    expect(sprite._materialIsBootstrapDefault).toBe(true)

    const explicit = new Sprite2DMaterial({
      map: texture,
      transparent: true,
      premultipliedAlpha: true,
    })
    sprite.material = explicit

    expect(sprite._materialIsBootstrapDefault).toBe(false)

    scene.add(sprite)
    fireSceneHook(scene, renderer)

    expect(sprite.material).toBe(explicit)
    expect((sprite.material as Sprite2DMaterial).getTexture()).toBe(texture)
  })

  it('material setter clears bootstrap/registry-default bookkeeping on direct assignment', () => {
    const sprite = new Sprite2D({ texture })
    expect(sprite._materialIsBootstrapDefault).toBe(true)

    sprite.material = new Sprite2DMaterial({ map: texture, transparent: true })

    expect(sprite._materialIsBootstrapDefault).toBe(false)
    expect(sprite._materialWasRegistryDefault).toBe(false)
  })

  it('two renderers rendering the same primed scene register into the first; batches are scene children either way', () => {
    const sprite = new Sprite2D({ texture })
    scene.add(sprite)

    const rendererB = makeRenderer()
    fireSceneHook(scene, renderer)
    fireSceneHook(scene, rendererB)

    // First renderer's registry owns the sprite; second stays empty —
    // its draws still see the batch meshes because they're scene children.
    expect(peekRegistry(renderer, scene)!.sprites.has(sprite)).toBe(true)
    expect(peekRegistry(rendererB, scene)?.sprites.size ?? 0).toBe(0)
  })
})
