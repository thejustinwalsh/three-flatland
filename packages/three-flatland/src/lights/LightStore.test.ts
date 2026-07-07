import { describe, it, expect } from 'vitest'
import { FloatType, RGBAFormat, NearestFilter } from 'three'
import { LightStore } from './LightStore'
import { Light2D } from './Light2D'

describe('LightStore', () => {
  it('should construct with default maxLights', () => {
    const store = new LightStore()
    expect(store.maxLights).toBe(1024)
  })

  it('should construct with custom maxLights', () => {
    const store = new LightStore({ maxLights: 64 })
    expect(store.maxLights).toBe(64)
  })

  it('should create a DataTexture with correct dimensions', () => {
    const store = new LightStore({ maxLights: 32 })
    const tex = store.lightsTexture

    expect(tex).toBeDefined()
    expect(tex.image.width).toBe(32)
    expect(tex.image.height).toBe(4)
    expect(tex.format).toBe(RGBAFormat)
    expect(tex.type).toBe(FloatType)
    expect(tex.minFilter).toBe(NearestFilter)
    expect(tex.magFilter).toBe(NearestFilter)
  })

  it('should expose a lightsTextureNode', () => {
    const store = new LightStore()
    expect(store.lightsTextureNode).toBeDefined()
  })

  it('should expose a countNode initialized to 0', () => {
    const store = new LightStore()
    expect(store.countNode).toBeDefined()
    expect(store.countNode.value).toBe(0)
  })

  it('should sync light data into the DataTexture', () => {
    const store = new LightStore({ maxLights: 8 })
    const light = new Light2D({
      type: 'point',
      position: [10, 20],
      color: 0xff0000,
      intensity: 1.5,
      distance: 100,
      decay: 2,
    })

    store.sync([light])

    expect(store.countNode.value).toBe(1)

    // Read raw data from backing array
    const data = store.lightsTexture.image.data as Float32Array
    const maxLights = store.maxLights
    const lineSize = maxLights * 4

    // Row 0: posX, posY, colorR, colorG
    expect(data[0]).toBe(10) // posX
    expect(data[1]).toBe(20) // posY
    // Colors are stored as linear float values (from THREE.Color)
    expect(data[2]).toBeGreaterThan(0) // colorR (red channel)

    // Row 1: colorB, intensity, distance, decay
    expect(data[lineSize + 1]).toBe(1.5) // intensity
    expect(data[lineSize + 2]).toBe(100) // distance
    expect(data[lineSize + 3]).toBe(2) // decay

    // Row 3: type=0 (point), enabled=1
    expect(data[3 * lineSize + 0]).toBe(0) // type: point
    expect(data[3 * lineSize + 1]).toBe(1) // enabled
  })

  it('should sync multiple lights', () => {
    const store = new LightStore({ maxLights: 8 })
    const light1 = new Light2D({ type: 'point', position: [10, 20], intensity: 1 })
    const light2 = new Light2D({ type: 'ambient', intensity: 0.5 })

    store.sync([light1, light2])
    expect(store.countNode.value).toBe(2)
  })

  it('should clamp light count to maxLights', () => {
    const store = new LightStore({ maxLights: 2 })
    const lights = [
      new Light2D({ type: 'point', intensity: 1 }),
      new Light2D({ type: 'point', intensity: 2 }),
      new Light2D({ type: 'point', intensity: 3 }),
    ]

    store.sync(lights)
    expect(store.countNode.value).toBe(2)
  })

  it('should zero out unused slots', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1 })

    // First sync with 1 light
    store.sync([light])
    expect(store.countNode.value).toBe(1)

    // Sync with no lights — should zero out
    store.sync([])
    expect(store.countNode.value).toBe(0)

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    // All slots should have enabled=0
    for (let i = 0; i < store.maxLights; i++) {
      expect(data[3 * lineSize + i * 4 + 1]).toBe(0) // enabled
    }
  })

  it('should encode light types correctly', () => {
    const store = new LightStore({ maxLights: 8 })
    const lights = [
      new Light2D({ type: 'point' }),
      new Light2D({ type: 'spot' }),
      new Light2D({ type: 'directional' }),
      new Light2D({ type: 'ambient' }),
    ]

    store.sync(lights)

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 0 * 4 + 0]).toBe(0) // point
    expect(data[3 * lineSize + 1 * 4 + 0]).toBe(1) // spot
    expect(data[3 * lineSize + 2 * 4 + 0]).toBe(2) // directional
    expect(data[3 * lineSize + 3 * 4 + 0]).toBe(3) // ambient
  })

  it('should handle disabled lights', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1 })
    light.enabled = false

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 1]).toBe(0) // enabled = 0
  })

  it('should pack castsShadow=true into row3.b as 1.0', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: true })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    // Row 3, column B (offset +2) = castsShadow flag
    expect(data[3 * lineSize + 2]).toBe(1)
  })

  it('should pack castsShadow=false into row3.b as 0.0', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: false })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 2]).toBe(0)
  })

  it('should default castsShadow packing to 1.0 when option omitted', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1 })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    expect(data[3 * lineSize + 2]).toBe(1)
  })

  it('should preserve enabled column G when writing castsShadow column B', () => {
    const store = new LightStore({ maxLights: 4 })
    const light = new Light2D({ type: 'point', intensity: 1, castsShadow: false })

    store.sync([light])

    const data = store.lightsTexture.image.data as Float32Array
    const lineSize = store.maxLights * 4

    // Regression guard: column G (enabled) unaffected by the new column B write.
    expect(data[3 * lineSize + 1]).toBe(1)
    expect(data[3 * lineSize + 2]).toBe(0)
  })

  it('should expose readLightData that returns TSL nodes', () => {
    const store = new LightStore({ maxLights: 8 })

    // readLightData returns TSL nodes — we can't evaluate them without a GPU,
    // but we can verify the structure
    const { row0, row1, row2, row3 } = store.readLightData(0 as unknown as Node<'float'>)
    expect(row0).toBeDefined()
    expect(row1).toBeDefined()
    expect(row2).toBeDefined()
    expect(row3).toBeDefined()
  })

  it('should dispose the DataTexture', () => {
    const store = new LightStore()
    // Should not throw
    store.dispose()
  })
})
