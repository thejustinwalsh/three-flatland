import { describe, it, expect, afterEach } from 'vitest'
import { createWorld, universe } from 'koota'
import { getGlobalWorld, resetGlobalWorld, assignWorld } from './world'

describe('world management', () => {
  afterEach(() => {
    resetGlobalWorld()
    universe.reset()
  })

  describe('getGlobalWorld', () => {
    it('should return the same world on multiple calls', () => {
      const world1 = getGlobalWorld()
      const world2 = getGlobalWorld()
      expect(world1).toBe(world2)
    })

    it('should return a valid world', () => {
      const world = getGlobalWorld()
      expect(world).toBeDefined()
      expect(world.id).toBeGreaterThanOrEqual(0)
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
      const obj: { _flatlandWorld?: import('koota').World | null } = {}
      assignWorld(obj, world)
      expect(obj._flatlandWorld).toBe(world)
    })

    it('should allow re-assigning the same world', () => {
      const world = createWorld()
      const obj: { _flatlandWorld?: import('koota').World | null } = {}
      assignWorld(obj, world)
      assignWorld(obj, world) // Should not throw
      expect(obj._flatlandWorld).toBe(world)
    })

    it('should throw when switching to a different world', () => {
      const world1 = createWorld()
      const world2 = createWorld()
      const obj: { _flatlandWorld?: import('koota').World | null } = {}
      assignWorld(obj, world1)
      expect(() => assignWorld(obj, world2)).toThrow('Cannot switch worlds')
    })

    it('should allow assigning to an object with null world', () => {
      const world = createWorld()
      const obj: { _flatlandWorld?: import('koota').World | null } = { _flatlandWorld: null }
      assignWorld(obj, world)
      expect(obj._flatlandWorld).toBe(world)
    })
  })
})
