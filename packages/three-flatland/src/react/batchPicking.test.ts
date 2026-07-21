import { describe, it, expect, beforeEach } from 'vitest'
import { Raycaster, Texture } from 'three'
import { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteBatch } from '../pipeline/SpriteBatch'
import { proxyPickToBatch, unproxyPickFromBatch, retireBatchPicking } from './batchPicking'

/**
 * R3F batch-root picking rewires which object R3F raycasts: a batched sprite
 * leaves `state.internal.interaction` and its owning batch stands in for it.
 * These tests drive the list-manipulation directly with a synthetic R3F
 * store + fake batch (the module is structurally typed against R3F's shapes),
 * covering the opt-out and teardown transitions that the browser smoke can't.
 */

interface FakeInternal {
  interaction: object[]
  initialHits: object[]
}
interface FakeStore {
  getState(): { internal: FakeInternal }
}

function makeStore(): { store: FakeStore; internal: FakeInternal } {
  const internal: FakeInternal = { interaction: [], initialHits: [] }
  return { store: { getState: () => ({ internal }) }, internal }
}

/** A Sprite2D wired as an R3F-managed, event-bearing object. */
function makeManagedSprite(store: FakeStore, handlers: Record<string, unknown> = { onClick() {} }): Sprite2D {
  const sprite = new Sprite2D({ texture: new Texture() })
  ;(sprite as unknown as { __r3f: unknown }).__r3f = { root: store, eventCount: 1, handlers }
  return sprite
}

/** A minimal object usable as a SpriteBatch key/list-member. */
function makeFakeBatch(): SpriteBatch {
  return {} as unknown as SpriteBatch
}

describe('batchPicking — R3F interaction-list proxy', () => {
  let store: FakeStore
  let internal: FakeInternal
  let batch: SpriteBatch

  beforeEach(() => {
    ;({ store, internal } = makeStore())
    batch = makeFakeBatch()
  })

  it('splices a proxied sprite out and registers the batch once', () => {
    const a = makeManagedSprite(store)
    const b = makeManagedSprite(store)
    internal.interaction.push(a, b)

    proxyPickToBatch(a, batch)
    proxyPickToBatch(b, batch)

    // Both sprites left the per-object list; one batch stands in for them.
    expect(internal.interaction).toHaveLength(1)
    expect(internal.interaction[0]).toBe(batch)
    expect(a.raycast).toBeNull()
    expect(b.raycast).toBeNull()
    expect(a._pickProxied).toBe(true)
    expect(b._pickProxied).toBe(true)
  })

  it('leaves a custom raycast untouched (does not proxy or clobber it)', () => {
    const custom = () => {}
    const s = makeManagedSprite(store)
    ;(s as unknown as { raycast: unknown }).raycast = custom
    internal.interaction.push(s)

    proxyPickToBatch(s, batch)

    // Own raycast → not proxied: the custom fn survives, sprite stays listed,
    // no batch registered.
    expect(s.raycast).toBe(custom)
    expect(s._pickProxied).toBe(false)
    expect(internal.interaction).toEqual([s])
  })

  it("leaves a hitTestMode='none' sprite alone (own null is its opt-out)", () => {
    const s = makeManagedSprite(store)
    s.hitTestMode = 'none' // installs own raycast = null
    proxyPickToBatch(s, batch)

    expect(s._pickProxied).toBe(false)
    // Nothing registered — the sprite was never in the pickable set.
    expect(internal.interaction).toHaveLength(0)
  })

  it('re-lists a proxied sprite on unproxy and retires the empty batch', () => {
    const s = makeManagedSprite(store)
    internal.interaction.push(s)
    proxyPickToBatch(s, batch)
    expect(internal.interaction).toEqual([batch])

    unproxyPickFromBatch(s, batch)

    // Sprite restored to the per-object list; batch gone; prototype raycast back.
    expect(s._pickProxied).toBe(false)
    expect(typeof s.raycast).toBe('function')
    expect(internal.interaction).toEqual([s])
  })

  it('retire with LIVE members restores them instead of stranding them', () => {
    const a = makeManagedSprite(store)
    const b = makeManagedSprite(store)
    internal.interaction.push(a, b)
    proxyPickToBatch(a, batch)
    proxyPickToBatch(b, batch)
    expect(internal.interaction).toEqual([batch])

    // dispose()/recycle path: retire while members are still proxied.
    retireBatchPicking(batch)

    // Both members must be pickable again — prototype raycast restored,
    // back in the per-object list, and re-proxyable (raycast no longer null).
    for (const s of [a, b]) {
      expect(s._pickProxied).toBe(false)
      expect(typeof s.raycast).toBe('function')
      expect(internal.interaction).toContain(s)
    }
    expect(internal.interaction).not.toContain(batch)

    // A restored member can be proxied onto a fresh batch (was stranded before).
    const batch2 = makeFakeBatch()
    proxyPickToBatch(a, batch2)
    expect(a._pickProxied).toBe(true)
    expect(internal.interaction).toContain(batch2)
  })

  it('no-ops for a vanilla (non-R3F) sprite', () => {
    const s = new Sprite2D({ texture: new Texture() })
    // No __r3f — pure three.js usage.
    proxyPickToBatch(s, batch)
    expect(s._pickProxied).toBe(false)
    expect(typeof s.raycast).toBe('function')

    // And its own raycast still hits when driven directly (sanity).
    const rc = new Raycaster()
    expect(() => s.raycast(rc, [])).not.toThrow()
  })
})
