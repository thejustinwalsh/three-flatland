// three-flatland/react — R3F batch-root picking proxy
//
// R3F registers every interactive object (eventCount > 0, raycast !== null)
// in `state.internal.interaction` and raycasts EACH of them per pointer
// event — O(n) in interactive sprite count. For batched sprites that's
// wasted work: the owning SpriteBatch already broadphases its members
// through a spatial grid. This module moves R3F's raycast target from the
// member sprites to the batch:
//
//   - each R3F-managed sprite that enters a batch gets `raycast = null`
//     (R3F's documented opt-out) and is spliced out of the interaction
//     list; `_pickProxied` marks the null as ours so the batch's
//     delegation (and later restoration) can tell it apart from a user's
//     explicit `raycast={null}` / `hitTestMode = 'none'`
//   - the batch itself is registered once in the same interaction list,
//     with a minimal synthesized `__r3f` so R3F's `getRootState` can
//     resolve its store (the batch lives in flatland's internal scene,
//     outside any R3F-traversable parent chain)
//
// `SpriteBatch.raycast` pushes intersections with `object === sprite`, and
// R3F's dispatch bubbles from `hit.object` through `__r3f.eventCount`
// owners — so `<sprite2D onClick>` fires exactly as before, with
// `event.object === sprite`, at broadphase cost instead of O(n).
//
// Typed structurally against R3F's shapes (no @react-three/fiber import —
// the core package must not depend on R3F, only consume its shapes), so
// the batching systems can call these hooks unconditionally: sprites
// without `__r3f` (vanilla three.js usage) no-op.
//
// The supported way to control a sprite's picking is `hitTestMode`
// (none/bounds/radius/alpha) — it is honored correctly through batching
// (the setter is `_pickProxied`-aware and the batch's narrow phase
// re-reads the mode). Mutating the raw three.js `raycast` property on an
// ALREADY-batched sprite is a low-level poke this proxy cannot track:
// only the raycast state at proxy time is captured, so a `raycast`
// reassigned mid-batch is ignored until the sprite next leaves and
// re-enters a batch. Set picking via `hitTestMode`, or before enrollment.

import type { Object3D } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteBatch } from '../pipeline/SpriteBatch'

/** Structural slice of R3F's `RootState.internal` that this module touches. */
interface R3FInternal {
  interaction: Object3D[]
  initialHits: Object3D[]
}

interface R3FRootState {
  internal: R3FInternal
}

/** Structural slice of R3F's zustand store. */
interface R3FStore {
  getState(): R3FRootState
}

/** Structural slice of R3F's per-object instance (`object.__r3f`). */
interface R3FInstanceSlice {
  root: R3FStore
  eventCount: number
  handlers: Record<string, ((event: unknown) => void) | undefined>
}

interface WithR3F {
  __r3f?: R3FInstanceSlice
}

/** Live registration of a batch in an R3F interaction list. */
interface BatchPickRegistration {
  root: R3FStore
  /** R3F-managed member sprites whose picking is proxied through the batch. */
  sprites: Set<Sprite2D>
}

const registrations = new WeakMap<SpriteBatch, BatchPickRegistration>()

/**
 * True when a sprite is R3F-managed (`object.__r3f` present). A NON-proxied
 * such sprite handles its own picking through R3F's per-object interaction
 * list — so `SpriteBatch.raycast` must skip it as a grid candidate, or it
 * would be hit-tested twice (once by R3F, once by the batch). Vanilla
 * (three.js) sprites lack `__r3f` and are picked ONLY via the batch grid.
 */
export function isR3FManaged(sprite: Sprite2D): boolean {
  return (sprite as WithR3F).__r3f !== undefined
}

/**
 * Inert truthy marker for R3F's `filterPointerEvents`: pointer-move /
 * drag / drop events only raycast interaction objects whose handlers
 * claim interest. The batch must pass that filter so hover (and drag)
 * events still reach member sprites — the member's REAL handlers are
 * what dispatch invokes (the batch is never an eventObject; it has
 * `eventCount: 0` and never appears in a hit's bubble chain).
 */
const MARKER = (): void => {}

/**
 * The batch sits in the interaction list but never lands in
 * `initialHits`, so R3F calls its `onPointerMissed` on every qualifying
 * click. Forward it to member sprites the way R3F would have when they
 * were listed individually: every R3F member with handlers that was not
 * among the pointerdown's initial hits.
 */
function createBatchPointerMissed(reg: BatchPickRegistration): (event: unknown) => void {
  return (event: unknown): void => {
    const initialHits = reg.root.getState()?.internal?.initialHits
    for (const sprite of reg.sprites) {
      const inst = (sprite as WithR3F).__r3f
      if (!inst?.eventCount) continue
      if (initialHits?.includes(sprite)) continue
      inst.handlers.onPointerMissed?.(event)
    }
  }
}

/**
 * Route an R3F-managed sprite's picking through its batch. Called by the
 * batching systems whenever a sprite lands in a batch (assign/reassign).
 * No-op for vanilla sprites (no `__r3f`) and for sprites whose `raycast`
 * is already nulled by the user or `hitTestMode = 'none'` — that null is
 * an opt-out this proxy must respect, not replace.
 */
export function proxyPickToBatch(sprite: Sprite2D, batch: SpriteBatch): void {
  const inst = (sprite as WithR3F).__r3f
  if (!inst?.root) return
  // Only proxy sprites using the DEFAULT (prototype) raycast. An OWN
  // `raycast` property means the sprite has opted out or customized picking,
  // and we must not clobber it:
  //   - `hitTestMode = 'none'` / user `raycast={null}` → own null (already
  //     excluded from R3F's interaction list — nothing to proxy)
  //   - user `raycast={customFn}` → own function that stays in R3F's
  //     per-object list and works unchanged
  // Our own proxy installs an own null too, so this doubles as the
  // idempotency guard: a re-proxied sprite already has one.
  if (Object.hasOwn(sprite, 'raycast')) return
  const state = inst.root.getState()
  const interaction = state?.internal?.interaction
  if (!interaction) return

  // Exclude the sprite from R3F's per-object raycast list. Handlers stay
  // registered (`__r3f.eventCount`), so dispatch still fires them when
  // the batch pushes an intersection with `object === sprite`.
  ;(sprite as { raycast: unknown }).raycast = null
  sprite._pickProxied = true
  const idx = interaction.indexOf(sprite)
  if (idx > -1) interaction.splice(idx, 1)

  // Register the batch once per tenancy.
  let reg = registrations.get(batch)
  if (!reg) {
    reg = { root: inst.root, sprites: new Set() }
    registrations.set(batch, reg)
    ;(batch as WithR3F).__r3f = {
      root: inst.root,
      eventCount: 0,
      handlers: {
        onPointerMove: MARKER,
        onDragOver: MARKER,
        onDrop: MARKER,
        onPointerMissed: createBatchPointerMissed(reg),
      },
    }
    if (!interaction.includes(batch)) interaction.push(batch)
  }
  reg.sprites.add(sprite)
}

/**
 * Undo {@link proxyPickToBatch} when a sprite leaves its batch
 * (remove/reassign/evict/unenroll). Restores the prototype `raycast`
 * (unless `hitTestMode = 'none'` owns the null), re-lists the sprite in
 * R3F's interaction list if it still has handlers, and unregisters the
 * batch when its last proxied member leaves.
 */
export function unproxyPickFromBatch(sprite: Sprite2D, batch: SpriteBatch): void {
  const reg = registrations.get(batch)
  if (reg && reg.sprites.delete(sprite) && reg.sprites.size === 0) {
    retireBatchPicking(batch)
  }
  restoreProxiedSprite(sprite)
}

/**
 * Undo a single sprite's proxy: restore the prototype `raycast` (unless
 * `hitTestMode = 'none'` owns the null) and re-list it in R3F's per-object
 * interaction list if it still has handlers. Idempotent — a no-op for a
 * sprite that isn't proxied.
 */
function restoreProxiedSprite(sprite: Sprite2D): void {
  if (!sprite._pickProxied) return
  sprite._pickProxied = false
  if (sprite.hitTestMode !== 'none') {
    delete (sprite as { raycast?: unknown }).raycast
  }

  // Re-list for R3F's per-object raycast — a standalone sprite is no
  // longer reachable through any batch. Mirrors R3F's own membership
  // condition (eventCount && raycast !== null). During R3F unmount this
  // is transient: removeInteractivity filters the sprite right back out.
  const inst = (sprite as WithR3F).__r3f
  if (inst?.eventCount && sprite.raycast !== null) {
    const interaction = inst.root.getState()?.internal?.interaction
    if (interaction && !interaction.includes(sprite)) interaction.push(sprite)
  }
}

/**
 * Force-unregister a batch from its R3F interaction list. Called when
 * the last proxied member leaves, and defensively on batch recycle /
 * dispose so a pooled or torn-down mesh never lingers in a live store.
 */
export function retireBatchPicking(batch: SpriteBatch): void {
  const reg = registrations.get(batch)
  if (!reg) return
  registrations.delete(batch)
  delete (batch as WithR3F).__r3f
  // Restore any members still proxied through this batch — a disposed
  // batch is about to vanish, so its sprites must not be left pointing at
  // a dead raycast target (unpickable, and un-re-proxyable while their
  // `raycast` stays null). Normally the last member's unproxy already
  // emptied the set; this covers dispose()/recycle with live members.
  for (const sprite of reg.sprites) restoreProxiedSprite(sprite)
  const interaction = reg.root.getState()?.internal?.interaction
  if (!interaction) return
  const idx = interaction.indexOf(batch)
  if (idx > -1) interaction.splice(idx, 1)
}
