import { act, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrthographicCamera, Vector2 } from 'three'
import { createRoot, extend } from '@react-three/fiber/webgpu'
import { universe } from 'koota'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland } from '../Flatland'

extend({ Flatland })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  vi.unstubAllGlobals()
  universe.reset()
})

async function createTestRoot(width: number, height: number) {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const surface = { width, height }
  const renderer = {
    render() {},
    setSize(nextWidth: number, nextHeight: number) {
      surface.width = nextWidth
      surface.height = nextHeight
    },
    getSize(target: Vector2) {
      return target.set(surface.width, surface.height)
    },
    getDrawingBufferSize(target: Vector2) {
      return target.set(surface.width, surface.height)
    },
    setPixelRatio() {},
    getPixelRatio: () => 1,
    getRenderTarget: () => null,
    setRenderTarget() {},
    setClearColor() {},
    autoClear: true,
    hasInitialized: () => true,
  }
  const canvas = { width: 0, height: 0 } as OffscreenCanvas
  const root = createRoot(canvas)
  await root.configure({
    renderer,
    frameloop: 'never',
    size: { width, height, top: 0, left: 0 },
  })
  return { renderer, root, surface }
}

async function unmountTestRoot(root: ReturnType<typeof createRoot>): Promise<void> {
  await act(async () => {
    root.unmount()
    await Promise.resolve()
  })
}

describe('React Flatland surface sizing', () => {
  it('restores the auto sentinel when an aspect prop is removed and survives a 0x0 first commit', async () => {
    const { renderer, root, surface } = await createTestRoot(0, 0)

    const flatlandRef = createRef<Flatland>()
    await act(async () => {
      root.render(<flatland ref={flatlandRef} viewSize={800} aspect={2} pixelPerfect={false} />)
      await Promise.resolve()
    })
    expect(flatlandRef.current!.aspect).toBe(2)
    expect(flatlandRef.current!.camera.right).toBe(800)

    await act(async () => {
      root.render(<flatland ref={flatlandRef} viewSize={800} pixelPerfect={false} />)
      await Promise.resolve()
    })
    expect(flatlandRef.current!.aspect).toBe('auto')

    flatlandRef.current!.render(renderer as unknown as WebGPURenderer)
    // An unmeasured surface preserves the last valid ratio instead of
    // replacing it with NaN/Infinity or inventing a new frustum.
    expect(flatlandRef.current!.resolvedAspect).toBe(2)
    expect(Number.isFinite(flatlandRef.current!.camera.right)).toBe(true)

    surface.width = 1280
    surface.height = 720
    flatlandRef.current!.render(renderer as unknown as WebGPURenderer)
    expect(flatlandRef.current!.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(flatlandRef.current!.camera.right).toBeCloseTo((800 * (1280 / 720)) / 2)

    await unmountTestRoot(root)
  })

  it('restores its managed camera when a custom camera prop is removed', async () => {
    const { renderer, root } = await createTestRoot(1280, 720)

    const customCamera = new OrthographicCamera(-10, 10, 10, -10)
    const flatlandRef = createRef<Flatland>()
    await act(async () => {
      root.render(<flatland ref={flatlandRef} camera={customCamera} viewSize={800} pixelPerfect={false} />)
      await Promise.resolve()
    })
    expect(flatlandRef.current!.camera).toBe(customCamera)

    await act(async () => {
      root.render(<flatland ref={flatlandRef} viewSize={800} pixelPerfect={false} />)
      await Promise.resolve()
    })
    flatlandRef.current!.render(renderer as unknown as WebGPURenderer)

    expect(flatlandRef.current!.camera).not.toBe(customCamera)
    expect(flatlandRef.current!.resolvedAspect).toBeCloseTo(1280 / 720)
    expect(flatlandRef.current!.camera.right).toBeCloseTo((800 * (1280 / 720)) / 2)

    await unmountTestRoot(root)
  })
})
