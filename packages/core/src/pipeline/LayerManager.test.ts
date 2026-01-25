import { describe, it, expect, beforeEach } from 'vitest'
import { Texture } from 'three'
import { LayerManager, Layer } from './LayerManager'
import { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { Layers } from './layers'

describe('Layer', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  it('should create a layer with config', () => {
    const layer = new Layer({
      name: 'entities',
      value: 3,
      blendMode: 'additive',
      sortMode: 'y-sort',
    })

    expect(layer.name).toBe('entities')
    expect(layer.value).toBe(3)
    expect(layer.blendMode).toBe('additive')
    expect(layer.sortMode).toBe('y-sort')
    expect(layer.visible).toBe(true)
  })

  it('should add sprites', () => {
    const layer = new Layer({ name: 'test', value: 0 })
    const sprite = new Sprite2D({ material })

    layer.add(sprite)

    expect(layer.count).toBe(1)
    expect(layer.has(sprite)).toBe(true)
    expect(sprite.layer).toBe(0)
  })

  it('should remove sprites', () => {
    const layer = new Layer({ name: 'test', value: 0 })
    const sprite = new Sprite2D({ material })

    layer.add(sprite)
    layer.remove(sprite)

    expect(layer.count).toBe(0)
    expect(layer.has(sprite)).toBe(false)
  })

  it('should toggle visibility', () => {
    const layer = new Layer({ name: 'test', value: 0 })
    const sprite = new Sprite2D({ material })

    layer.add(sprite)
    layer.visible = false

    expect(layer.visible).toBe(false)
    expect(sprite.visible).toBe(false)
  })

  it('should iterate over sprites', () => {
    const layer = new Layer({ name: 'test', value: 0 })
    const sprite1 = new Sprite2D({ material })
    const sprite2 = new Sprite2D({ material })

    layer.add(sprite1)
    layer.add(sprite2)

    const sprites = [...layer]

    expect(sprites).toHaveLength(2)
    expect(sprites).toContain(sprite1)
    expect(sprites).toContain(sprite2)
  })
})

describe('LayerManager', () => {
  let texture: Texture
  let material: Sprite2DMaterial

  beforeEach(() => {
    texture = new Texture()
    // @ts-expect-error - mocking image for tests
    texture.image = { width: 100, height: 100 }
    material = new Sprite2DMaterial({ map: texture })
  })

  it('should create an empty manager', () => {
    const manager = new LayerManager()

    expect(manager.count).toBe(0)
  })

  it('should create layers', () => {
    const manager = new LayerManager()

    const layer = manager.createLayer({
      name: 'entities',
      value: Layers.ENTITIES,
    })

    expect(layer.name).toBe('entities')
    expect(layer.value).toBe(Layers.ENTITIES)
    expect(manager.count).toBe(1)
    expect(manager.hasLayer('entities')).toBe(true)
  })

  it('should throw on duplicate layer names', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'test', value: 0 })

    expect(() => {
      manager.createLayer({ name: 'test', value: 1 })
    }).toThrow('Layer "test" already exists')
  })

  it('should get layers by name', () => {
    const manager = new LayerManager()
    const layer = manager.createLayer({ name: 'entities', value: 3 })

    expect(manager.getLayer('entities')).toBe(layer)
    expect(manager.getLayer('nonexistent')).toBeUndefined()
  })

  it('should get layers by value', () => {
    const manager = new LayerManager()
    const layer = manager.createLayer({ name: 'entities', value: 3 })

    expect(manager.getLayerByValue(3)).toBe(layer)
    expect(manager.getLayerByValue(999)).toBeUndefined()
  })

  it('should remove layers', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'test', value: 0 })

    const removed = manager.removeLayer('test')

    expect(removed).toBe(true)
    expect(manager.hasLayer('test')).toBe(false)
    expect(manager.count).toBe(0)
  })

  it('should add sprites to layers', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'entities', value: 3 })
    const sprite = new Sprite2D({ material })

    manager.addToLayer('entities', sprite)

    expect(sprite.layer).toBe(3)
    expect(manager.getLayer('entities')?.has(sprite)).toBe(true)
  })

  it('should throw on adding to nonexistent layer', () => {
    const manager = new LayerManager()
    const sprite = new Sprite2D({ material })

    expect(() => {
      manager.addToLayer('nonexistent', sprite)
    }).toThrow('Layer "nonexistent" not found')
  })

  it('should move sprites between layers', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'entities', value: 3 })
    manager.createLayer({ name: 'effects', value: 4 })
    const sprite = new Sprite2D({ material })

    manager.addToLayer('entities', sprite)
    manager.moveToLayer(sprite, 'effects')

    expect(sprite.layer).toBe(4)
    expect(manager.getLayer('entities')?.has(sprite)).toBe(false)
    expect(manager.getLayer('effects')?.has(sprite)).toBe(true)
  })

  it('should set layer visibility', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'entities', value: 3 })
    const sprite = new Sprite2D({ material })
    manager.addToLayer('entities', sprite)

    manager.setLayerVisible('entities', false)

    expect(manager.isLayerVisible('entities')).toBe(false)
    expect(sprite.visible).toBe(false)
  })

  it('should toggle layer visibility', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'entities', value: 3 })

    const visible = manager.toggleLayerVisible('entities')

    expect(visible).toBe(false)
    expect(manager.isLayerVisible('entities')).toBe(false)
  })

  it('should create default layers', () => {
    const manager = LayerManager.withDefaults()

    expect(manager.hasLayer('background')).toBe(true)
    expect(manager.hasLayer('ground')).toBe(true)
    expect(manager.hasLayer('shadows')).toBe(true)
    expect(manager.hasLayer('entities')).toBe(true)
    expect(manager.hasLayer('effects')).toBe(true)
    expect(manager.hasLayer('foreground')).toBe(true)
    expect(manager.hasLayer('ui')).toBe(true)
    expect(manager.count).toBe(7)
  })

  it('should get layer names', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'a', value: 0 })
    manager.createLayer({ name: 'b', value: 1 })

    const names = manager.getLayerNames()

    expect(names).toContain('a')
    expect(names).toContain('b')
  })

  it('should get all layers', () => {
    const manager = new LayerManager()
    const layer1 = manager.createLayer({ name: 'a', value: 0 })
    const layer2 = manager.createLayer({ name: 'b', value: 1 })

    const layers = manager.getLayers()

    expect(layers).toContain(layer1)
    expect(layers).toContain(layer2)
  })

  it('should clear all layers', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'test', value: 0 })

    manager.clear()

    expect(manager.count).toBe(0)
  })

  it('should iterate over layers', () => {
    const manager = new LayerManager()
    manager.createLayer({ name: 'a', value: 0 })
    manager.createLayer({ name: 'b', value: 1 })

    const layers = [...manager]

    expect(layers).toHaveLength(2)
  })
})
