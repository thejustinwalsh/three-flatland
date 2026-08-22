import { OrthographicCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { PixelPerfectCamera } from './PixelPerfectCamera'

describe('PixelPerfectCamera', () => {
  it('is a canonical no-arg OrthographicCamera', () => {
    const camera = new PixelPerfectCamera()

    expect(camera).toBeInstanceOf(OrthographicCamera)
    expect(camera.isOrthographicCamera).toBe(true)
    expect(camera.isPixelPerfectCamera).toBe(true)
    expect(camera.type).toBe('PixelPerfectCamera')
    expect(camera.manual).toBe(true)
    expect(camera.left).toBe(-200)
    expect(camera.right).toBe(200)
  })

  it('selects the largest integer scale that keeps viewSize visible', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setDrawingBufferSize(1280, 720)

    expect(camera.resolvedPixelScale).toBe(3)
    expect(camera.worldUnitsPerPixel).toBeCloseTo(1 / 3)
    expect(camera.top - camera.bottom).toBe(240)
    expect(camera.right - camera.left).toBe(426)
    expect(camera.viewport.toArray()).toEqual([1, 0, 1278, 720])
  })

  it('letterboxes leftover physical pixels instead of revealing fractional world space', () => {
    const camera = new PixelPerfectCamera({ viewSize: 400 })
    camera.setDrawingBufferSize(1281, 801)

    expect(camera.resolvedPixelScale).toBe(2)
    expect(camera.top - camera.bottom).toBe(400)
    expect(camera.right - camera.left).toBe(640)
    expect(camera.viewport.toArray()).toEqual([0, 0, 1280, 800])
  })

  it('supports an explicit integer pixel scale', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240, pixelScale: 4 })
    camera.setDrawingBufferSize(1280, 720)

    expect(camera.resolvedPixelScale).toBe(4)
    expect(camera.top - camera.bottom).toBe(180)
    expect(camera.right - camera.left).toBe(320)
  })

  it('fits an optional two-dimensional design extent', () => {
    const camera = new PixelPerfectCamera({ viewSize: 180, viewWidth: 320 })
    camera.setDrawingBufferSize(800, 720)

    expect(camera.resolvedPixelScale).toBe(2)
    expect(camera.right - camera.left).toBe(320)
    expect(camera.top - camera.bottom).toBe(180)
    expect(camera.viewport.toArray()).toEqual([80, 180, 640, 360])
  })

  it('uses physical viewport dimensions at HiDPI', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setViewportSize(640, 360, 2)

    expect(camera.drawingBufferWidth).toBe(1280)
    expect(camera.drawingBufferHeight).toBe(720)
    expect(camera.resolvedPixelScale).toBe(3)
    expect(camera.viewport.toArray()).toEqual([1, 0, 1278, 720])
  })

  it('maps logical canvas pointers through the centered viewport', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setViewportSize(640, 360, 2)

    expect(camera.getNormalizedDeviceCoordinates(0.5, 180, 2).toArray()).toEqual([-1, 0])
    expect(camera.getNormalizedDeviceCoordinates(639.5, 180, 2).toArray()).toEqual([1, 0])
    expect(camera.getNormalizedDeviceCoordinates(0, 180, 2).x).toBeLessThan(-1)
  })

  it('explicitly snaps camera pans without mutating depth', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setDrawingBufferSize(1280, 720)
    camera.position.set(0.49, -0.49, 123)

    expect(camera.snapPositionToPixelGrid()).toBe(camera)
    expect(camera.position.x).toBeCloseTo(1 / 3)
    expect(camera.position.y).toBeCloseTo(-1 / 3)
    expect(camera.position.z).toBe(123)
  })

  it('normalizes fractional surface measurements to physical pixel dimensions', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setViewportSize(640.75, 360.75, 1.5)

    expect(camera.drawingBufferWidth).toBe(961)
    expect(camera.drawingBufferHeight).toBe(541)
  })

  it('round-trips non-dyadic DPR viewports without losing a physical pixel', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setDrawingBufferSize(1281, 801)

    for (const dpr of [1.1, 1.3, 1.75, Math.PI]) {
      const logical = camera.getLogicalViewport(dpr)
      expect(logical.clone().multiplyScalar(dpr).floor().toArray()).toEqual(camera.viewport.toArray())
    }
  })

  it('quantizes canonical Three.js zoom to an integer pixel scale', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setDrawingBufferSize(1280, 720)
    camera.zoom = 1.5
    camera.updateProjectionMatrix()

    expect(camera.zoom).toBe(1.5)
    expect(camera.resolvedPixelScale).toBe(5)
    expect(camera.top - camera.bottom).toBe(144)
  })

  it('ignores invalid sizes and pixel scales without poisoning its projection', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240 })
    camera.setDrawingBufferSize(1280, 720)
    camera.setDrawingBufferSize(0, 0)
    camera.setDrawingBufferSize(NaN, 720)
    camera.pixelScale = 1.5

    expect(camera.drawingBufferWidth).toBe(1280)
    expect(camera.drawingBufferHeight).toBe(720)
    expect(camera.pixelScale).toBe('auto')
    expect(camera.resolvedPixelScale).toBe(3)
    expect(Number.isFinite(camera.projectionMatrix.elements[0])).toBe(true)
  })

  it('crops at 1x rather than downsampling a design larger than the framebuffer', () => {
    const camera = new PixelPerfectCamera({ viewSize: 240, viewWidth: 320 })
    camera.setDrawingBufferSize(160, 90)

    expect(camera.resolvedPixelScale).toBe(1)
    expect(camera.right - camera.left).toBe(160)
    expect(camera.top - camera.bottom).toBe(90)
    expect(camera.viewport.toArray()).toEqual([0, 0, 160, 90])
  })

  it('copies and clones its pixel projection contract', () => {
    const source = new PixelPerfectCamera({ viewSize: 180, pixelScale: 2 })
    source.setDrawingBufferSize(900, 540)
    source.position.set(12, 34, 100)
    source.zoom = 1.5
    source.near = 2
    source.far = 500
    source.updateProjectionMatrix()

    const copy = new PixelPerfectCamera().copy(source)
    const clone = source.clone()

    for (const camera of [copy, clone]) {
      expect(camera).toBeInstanceOf(PixelPerfectCamera)
      expect(camera.viewSize).toBe(180)
      expect(camera.pixelScale).toBe(2)
      expect(camera.drawingBufferWidth).toBe(900)
      expect(camera.drawingBufferHeight).toBe(540)
      expect(camera.viewport.toArray()).toEqual(source.viewport.toArray())
      expect(camera.position).toEqual(source.position)
      expect(camera.zoom).toBe(1.5)
      expect(camera.near).toBe(2)
      expect(camera.far).toBe(500)
      expect(camera.projectionMatrix.elements).toEqual(source.projectionMatrix.elements)
    }
  })
})
