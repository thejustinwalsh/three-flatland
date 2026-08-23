import { describe, it, expect, afterEach } from 'vitest'
import { createWorld, type World } from './runtime'
import { getGlobalWorld, resetGlobalWorld, assignWorld } from './world'

describe('world management', () => {
  afterEach(() => {
    resetGlobalWorld()
  })

  describe('getGlobalWorld', () => {
    it('should return the same world on multiple calls', () => {
      const world1 = getGlobalWorld()
      const world2 = getGlobalWorld()
      expect(world1).toBe(world2)
    })

    it('should return a valid world', () => {
      const world = getGlobalWorld()
      const entity = world.spawn()
      expect(entity).toBeGreaterThan(0)
      expect(world.isAlive(entity)).toBe(true)
    })
  })

  describe('resetGlobalWorld', () => {
    it('should create a new world after reset', () => {
      const world1 = getGlobalWorld()
      resetGlobalWorld()
      const world2 = getGlobalWorld()
      expect(world1).not.toBe(world2)
    })
  })

  describe('assignWorld', () => {
    it('should assign a world to an object', () => {
      const world = createWorld()
      const obj: { _flatlandWorld?: World | null } = {}
      assignWorld(obj, world)
      expect(obj._flatlandWorld).toBe(world)
      world.dispose()
    })

    it('should allow re-assigning the same world', () => {
      const world = createWorld()
      const obj: { _flatlandWorld?: World | null } = {}
      assignWorld(obj, world)
      assignWorld(obj, world) // Should not throw
      expect(obj._flatlandWorld).toBe(world)
      world.dispose()
    })

    it('should throw when switching to a different world', () => {
      const world1 = createWorld()
      const world2 = createWorld()
      const obj: { _flatlandWorld?: World | null } = {}
      assignWorld(obj, world1)
      expect(() => assignWorld(obj, world2)).toThrow('Cannot switch worlds')
      world1.dispose()
      world2.dispose()
    })

    it('should allow assigning to an object with null world', () => {
      const world = createWorld()
      const obj: { _flatlandWorld?: World | null } = { _flatlandWorld: null }
      assignWorld(obj, world)
      expect(obj._flatlandWorld).toBe(world)
      world.dispose()
    })
  })
})
