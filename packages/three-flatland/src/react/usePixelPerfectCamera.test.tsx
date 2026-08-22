import { act, StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoot, useThree } from '@react-three/fiber/webgpu'
import { Vector4 } from 'three'
import { PixelPerfectCamera } from '../cameras/PixelPerfectCamera'
import { usePixelPerfectCamera } from './usePixelPerfectCamera'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => vi.unstubAllGlobals())

describe('usePixelPerfectCamera', () => {
  it('installs a DPR-aware camera and restores the previous default', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const viewport = new Vector4(0, 0, 640, 360)
    const renderer = {
      render() {},
      setSize() {},
      setPixelRatio() {},
      getPixelRatio: () => 2,
      getViewport: (target: Vector4) => target.copy(viewport),
      setViewport: (x: number | Vector4, y?: number, width?: number, height?: number) => {
        if (x instanceof Vector4) viewport.copy(x)
        else viewport.set(x, y!, width!, height!)
      },
      hasInitialized: () => true,
    }
    const root = createRoot({ width: 0, height: 0 } as OffscreenCanvas)
    await root.configure({
      renderer,
      dpr: 2,
      frameloop: 'never',
      size: { width: 640, height: 360, top: 0, left: 0 },
    })

    let camera: PixelPerfectCamera | null = null
    let readCamera: (() => unknown) | null = null
    function Probe({ viewSize }: { viewSize?: number }) {
      camera = usePixelPerfectCamera({ viewSize })
      const get = useThree((state) => state.get)
      readCamera = () => get().camera
      return null
    }

    const rootStore = root.render(null)
    const previous = rootStore.getState().camera
    const previousGetCurrentViewport = rootStore.getState().viewport.getCurrentViewport
    await act(async () => {
      root.render(
        <StrictMode>
          <Probe viewSize={240} />
        </StrictMode>
      )
      await Promise.resolve()
    })

    expect(camera).toBeInstanceOf(PixelPerfectCamera)
    expect(camera!.drawingBufferWidth).toBe(1280)
    expect(camera!.drawingBufferHeight).toBe(720)
    expect(camera!.resolvedPixelScale).toBe(3)
    expect(camera!.viewport.toArray()).toEqual([1, 0, 1278, 720])
    expect(viewport.clone().multiplyScalar(2).floor().toArray()).toEqual(camera!.viewport.toArray())
    expect(readCamera!()).toBe(camera)

    const mountedState = rootStore.getState()
    expect(mountedState.viewport.width).toBe(426)
    expect(mountedState.viewport.height).toBe(240)
    expect(mountedState.viewport.aspect).toBeCloseTo(426 / 240)
    expect(mountedState.viewport.factor).toBe(1.5)
    expect(mountedState.viewport.getCurrentViewport(camera!).width).toBe(426)
    expect(mountedState.viewport.getCurrentViewport(camera!).height).toBe(240)
    expect(mountedState.viewport.getCurrentViewport(camera!).factor).toBe(1.5)
    const measuredLargerViewport = mountedState.viewport.getCurrentViewport(camera!, undefined, {
      width: 800,
      height: 450,
      top: 0,
      left: 0,
    })
    expect(measuredLargerViewport.width).toBe(533)
    expect(measuredLargerViewport.height).toBe(240)
    expect(measuredLargerViewport.factor).toBe(1.5)
    const setFromCamera = vi.spyOn(mountedState.raycaster, 'setFromCamera')
    mountedState.events.compute?.({ offsetX: 0.5, offsetY: 180 } as PointerEvent, mountedState)
    expect(mountedState.pointer.toArray()).toEqual([-1, 0])
    expect(setFromCamera).toHaveBeenLastCalledWith(mountedState.pointer, camera)

    mountedState.events.compute?.({ offsetX: 0, offsetY: 180 } as PointerEvent, mountedState)
    expect(mountedState.pointer.x).toBeLessThan(-1)
    expect(mountedState.events.filter?.([{ distance: 1 }] as never, mountedState)).toEqual([])

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe />
        </StrictMode>
      )
      await Promise.resolve()
    })
    expect(camera!.viewSize).toBe(400)
    expect(camera!.resolvedPixelScale).toBe(1)
    expect(viewport.clone().multiplyScalar(2).floor().toArray()).toEqual(camera!.viewport.toArray())
    expect(rootStore.getState().viewport.width).toBe(1280)
    expect(rootStore.getState().viewport.height).toBe(400)
    expect(rootStore.getState().viewport.factor).toBe(0.5)

    await act(async () => {
      rootStore.getState().setSize(800, 450)
      await Promise.resolve()
    })
    expect(camera!.drawingBufferWidth).toBe(1600)
    expect(camera!.drawingBufferHeight).toBe(900)
    expect(viewport.clone().multiplyScalar(2).floor().toArray()).toEqual(camera!.viewport.toArray())

    await act(async () => {
      root.render(null)
      await Promise.resolve()
    })
    expect(rootStore.getState().camera).toBe(previous)
    const restoredViewport = rootStore.getState().viewport.getCurrentViewport(previous)
    expect(rootStore.getState().viewport.getCurrentViewport).toBe(previousGetCurrentViewport)
    expect(rootStore.getState().viewport.width).toBeCloseTo(restoredViewport.width)
    expect(rootStore.getState().viewport.height).toBeCloseTo(restoredViewport.height)
    expect(viewport.toArray()).toEqual([0, 0, 800, 450])

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  })

  it('can create a manual camera without replacing the R3F default', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const viewport = new Vector4(0, 0, 640, 360)
    const renderer = {
      render() {},
      setSize() {},
      setPixelRatio() {},
      getPixelRatio: () => 1,
      getViewport: (target: Vector4) => target.copy(viewport),
      setViewport: (x: number | Vector4, y?: number, width?: number, height?: number) => {
        if (x instanceof Vector4) viewport.copy(x)
        else viewport.set(x, y!, width!, height!)
      },
      hasInitialized: () => true,
    }
    const root = createRoot({ width: 0, height: 0 } as OffscreenCanvas)
    await root.configure({
      renderer,
      frameloop: 'never',
      size: { width: 640, height: 360, top: 0, left: 0 },
    })
    const rootStore = root.render(null)
    const previous = rootStore.getState().camera
    let camera: (PixelPerfectCamera & { manual?: boolean }) | null = null

    function Probe() {
      camera = usePixelPerfectCamera({ makeDefault: false, viewSize: 180 })
      return null
    }

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe />
        </StrictMode>
      )
      await Promise.resolve()
    })

    expect(camera).toBeInstanceOf(PixelPerfectCamera)
    expect(camera!.manual).toBe(true)
    expect(rootStore.getState().camera).toBe(previous)
    expect(viewport.toArray()).toEqual([0, 0, 640, 360])

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  })

  it('round-trips a non-dyadic DPR viewport without losing a physical pixel', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const viewport = new Vector4(0, 0, 640, 360)
    const renderer = {
      render() {},
      setSize() {},
      setPixelRatio() {},
      getPixelRatio: () => 1.3,
      getViewport: (target: Vector4) => target.copy(viewport),
      setViewport: (x: number | Vector4, y?: number, width?: number, height?: number) => {
        if (x instanceof Vector4) viewport.copy(x)
        else viewport.set(x, y!, width!, height!)
      },
      hasInitialized: () => true,
    }
    const root = createRoot({ width: 0, height: 0 } as OffscreenCanvas)
    await root.configure({
      renderer,
      dpr: 1.3,
      frameloop: 'never',
      size: { width: 640, height: 360, top: 0, left: 0 },
    })

    let camera: PixelPerfectCamera | null = null
    function Probe() {
      camera = usePixelPerfectCamera({ viewSize: 200 })
      return null
    }

    await act(async () => {
      root.render(<Probe />)
      await Promise.resolve()
    })

    expect(camera!.viewport.toArray()).toEqual([0, 34, 832, 400])
    expect(viewport.clone().multiplyScalar(1.3).floor().toArray()).toEqual(camera!.viewport.toArray())

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  })
})
