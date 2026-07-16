import { describe, it, expect, afterEach } from 'vitest'
import { Scene } from 'three'
import { universe } from 'koota'
import { Registry, getOrCreateRegistry, peekRegistry } from './registry'

function makeRenderer(): object {
  // The registry never calls renderer methods — identity is all that matters.
  return { isFakeRenderer: true }
}

afterEach(() => {
  universe.reset()
})

describe('per-(renderer, scene) registry foundation', () => {
  it('returns the same registry for the same tuple', () => {
    const renderer = makeRenderer()
    const scene = new Scene()

    const a = getOrCreateRegistry(renderer, scene)
    const b = getOrCreateRegistry(renderer, scene)

    expect(a).toBe(b)
    expect(a.renderer).toBe(renderer)
    expect(a.scene).toBe(scene)
  })

  it('two renderers rendering the same scene get two registries', () => {
    const scene = new Scene()
    const r1 = makeRenderer()
    const r2 = makeRenderer()

    const a = getOrCreateRegistry(r1, scene)
    const b = getOrCreateRegistry(r2, scene)

    expect(a).not.toBe(b)
  })

  it('one renderer rendering two scenes gets two registries with distinct worlds', () => {
    const renderer = makeRenderer()
    const s1 = new Scene()
    const s2 = new Scene()

    const a = getOrCreateRegistry(renderer, s1)
    const b = getOrCreateRegistry(renderer, s2)

    expect(a).not.toBe(b)
    expect(a.world).not.toBe(b.world)
  })

  it('peekRegistry never creates', () => {
    const renderer = makeRenderer()
    const scene = new Scene()

    expect(peekRegistry(renderer, scene)).toBeNull()
    const created = getOrCreateRegistry(renderer, scene)
    expect(peekRegistry(renderer, scene)).toBe(created)
  })

  it('Symbol.for survives module duplication — a second module copy sees the same registry', () => {
    const renderer = makeRenderer()
    const scene = new Scene()
    const registry = getOrCreateRegistry(renderer, scene)

    // Simulate a duplicated bundle: resolve the host through the global
    // symbol registry exactly as a second module copy would.
    const sym = Symbol.for('three-flatland.registry')
    const host = (renderer as Record<symbol, unknown>)[sym] as {
      scenes: WeakMap<Scene, Registry>
    }
    expect(host).toBeDefined()
    expect(host.scenes.get(scene)).toBe(registry)
  })

  it('scaffold fields exist with their declared shapes', () => {
    const registry = getOrCreateRegistry(makeRenderer(), new Scene())

    expect(registry.sprites).toBeInstanceOf(Set)
    expect(registry.sprites.size).toBe(0)
    expect(registry.defaultMaterials).toBeInstanceOf(WeakMap)
    expect(registry.batches).toBeInstanceOf(Map)
    expect(registry.batches.size).toBe(0)
    expect(registry._sceneHookInstalled).toBe(false)
    expect(registry.group.name).toBe('FlatlandOrchestrator')
  })
})
