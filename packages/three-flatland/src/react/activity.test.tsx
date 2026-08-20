import { Activity, act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Texture } from 'three'
import { createRoot, extend } from '@react-three/fiber/webgpu'
import { universe } from 'koota'
import { Sprite2D } from '../sprites/Sprite2D'
import { SpriteGroup } from '../pipeline/SpriteGroup'

extend({ Sprite2D, SpriteGroup })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const renderer = {
  render() {},
  setSize() {},
  setPixelRatio() {},
  hasInitialized: () => true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  universe.reset()
})

describe('React Activity', () => {
  it('reversibly hides batched descendants inside an ordinary host group', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const canvas = { width: 64, height: 64 } as OffscreenCanvas
    const root = createRoot(canvas)
    await root.configure({
      renderer,
      frameloop: 'never',
      size: { width: 64, height: 64, top: 0, left: 0 },
    })

    const texture = new Texture()
    const renderView = async (mode: 'visible' | 'hidden') => {
      let store: ReturnType<typeof root.render> | undefined
      await act(async () => {
        store = root.render(
          <spriteGroup>
            <Activity mode={mode}>
              <group name="activity-host">
                <sprite2D texture={texture} position={[10, 0, 0]} scale={[20, 20, 1]} />
                <sprite2D texture={texture} position={[30, 0, 0]} scale={[20, 20, 1]} visible={false} />
              </group>
            </Activity>
          </spriteGroup>
        )
        await Promise.resolve()
      })
      return store!
    }

    const store = await renderView('hidden')
    const scene = store.getState().scene
    scene.updateMatrixWorld(true)
    const group = scene.getObjectByName('activity-host')!
    const sprite = group.children[0] as Sprite2D
    const authoredHiddenSprite = group.children[1] as Sprite2D
    expect(sprite._hierarchyManaged).toBe(true)
    expect(sprite._batchMesh).not.toBeNull()
    const retainedSlot = sprite._batchSlot
    expect(group.visible).toBe(false)
    expect(sprite.visible).toBe(true)
    expect(authoredHiddenSprite.visible).toBe(false)
    expect((sprite._batchMesh!.instanceMatrix.array as Float32Array)[sprite._batchSlot * 16]).toBe(0)
    expect((sprite._batchMesh!.instanceMatrix.array as Float32Array)[sprite._batchSlot * 16 + 12]).toBe(10)
    expect(authoredHiddenSprite._isAuthoredVisible()).toBe(false)

    await renderView('visible')
    scene.updateMatrixWorld(true)
    expect(group.visible).toBe(true)
    expect(sprite.visible).toBe(true)
    expect(authoredHiddenSprite.visible).toBe(false)
    expect(sprite._batchSlot).toBe(retainedSlot)
    expect((sprite._batchMesh!.instanceMatrix.array as Float32Array)[sprite._batchSlot * 16]).toBe(20)
    expect(authoredHiddenSprite._isAuthoredVisible()).toBe(false)
    expect(
      (authoredHiddenSprite._batchMesh!.instanceMatrix.array as Float32Array)[authoredHiddenSprite._batchSlot * 16]
    ).toBe(0)

    await renderView('hidden')
    scene.updateMatrixWorld(true)
    expect(group.visible).toBe(false)
    expect(sprite.visible).toBe(true)
    expect(authoredHiddenSprite.visible).toBe(false)
    expect(sprite._batchSlot).toBe(retainedSlot)
    expect((sprite._batchMesh!.instanceMatrix.array as Float32Array)[sprite._batchSlot * 16]).toBe(0)
    expect(authoredHiddenSprite._isAuthoredVisible()).toBe(false)

    await renderView('visible')
    scene.updateMatrixWorld(true)
    expect(group.visible).toBe(true)
    expect(sprite.visible).toBe(true)
    expect(authoredHiddenSprite.visible).toBe(false)
    expect(sprite._batchSlot).toBe(retainedSlot)
    expect((sprite._batchMesh!.instanceMatrix.array as Float32Array)[sprite._batchSlot * 16]).toBe(20)
    expect(authoredHiddenSprite._isAuthoredVisible()).toBe(false)

    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
  })
})
