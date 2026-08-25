import { describe, expect, it } from 'vitest'
import { Flatland } from '../Flatland'
import { createPassEffect, type PassEffect, type PassEffectFn } from '../pipeline/PassEffect'

const FirstPass = createPassEffect({
  name: 'postPassGraphFirst',
  schema: { amount: 1 },
  pass: () => (input) => input,
})

const SecondPass = createPassEffect({
  name: 'postPassGraphSecond',
  schema: {},
  pass: () => (input) => input,
})

function graph(flatland: Flatland): {
  readonly effects: PassEffect[]
  nextOrder: number
  readonly dirty: boolean
  project(): readonly PassEffectFn[] | null
} {
  return Reflect.get(flatland, '_postPassGraph')
}

describe('PostPassGraph', () => {
  it('keeps one authoritative ordered projection and reuses it across dirty rebuilds', () => {
    const flatland = new Flatland()
    const first = new FirstPass()
    const second = new SecondPass()

    flatland.addPass(first, 20).addPass(second, 10)

    const owner = graph(flatland)
    const initial = owner.project()
    expect(initial).toEqual([second._passFn, first._passFn])
    expect(owner.project()).toBeNull()

    first.enabled = false
    const disabled = owner.project()
    expect(disabled).toBe(initial)
    expect(disabled).toEqual([second._passFn])
    expect(owner.project()).toBeNull()

    first.enabled = true
    const enabled = owner.project()
    expect(enabled).toBe(initial)
    expect(enabled).toEqual([second._passFn, first._passFn])

    flatland.removePass(second)
    expect(owner.project()).toBe(initial)
    expect(initial).toEqual([first._passFn])

    flatland.clearPasses()
    expect(owner.project()).toBe(initial)
    expect(initial).toEqual([])
    expect(owner.nextOrder).toBe(0)

    flatland.dispose()
    expect(owner.effects).toEqual([])
    expect(owner.project()).toBeNull()
  })

  it('keeps graph publication unchanged when pass entity allocation throws', () => {
    const flatland = new Flatland()
    const active = new FirstPass()
    const candidate = new SecondPass()
    flatland.addPass(active)
    const owner = graph(flatland)
    owner.project()
    const nextOrder = owner.nextOrder
    const world = Reflect.get(flatland, '_sharedWorld')
    const spawn = world.spawn.bind(world)
    world.spawn = () => {
      throw new Error('capacity failed')
    }

    expect(() => flatland.addPass(candidate)).toThrow('capacity failed')
    expect(owner.effects).toEqual([active])
    expect(owner.nextOrder).toBe(nextOrder)
    expect(owner.dirty).toBe(false)
    expect(candidate._flatland).toBeNull()

    world.spawn = spawn
    flatland.dispose()
  })
})
