import type { Camera, Scene, WebGLRenderer } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import { computeRunKey } from '../ecs/batchUtils'
import { getOrCreateRegistry, peekRegistry, type Registry, type RendererLike } from './registry'

/**
 * Lazy materialization — dual-signal registration.
 *
 * Signal A (opportunistic, first-frame correct): `Sprite2D` listens for
 * three's `'added'` event, walks its parent chain to the scene, and
 * primes that scene via {@link flatlandPrime}. No renderer exists yet at
 * prime time, so priming records the sprite as pending on the scene and
 * installs the chained `Scene.onBeforeRender` hook; the real
 * per-(renderer, scene) registry materializes inside the hook on the
 * next render call — before three builds its render list, so mutations
 * land in the same render call (`Renderer.js`: updateMatrixWorld @1508 →
 * scene.onBeforeRender @1559 → _projectObject @1575).
 *
 * Signal B (fallback, one-frame-late but always works):
 * `Sprite2D.onBeforeRender` fires when the sprite's own mesh draws —
 * catching the detached-subtree-then-attached case `'added'` misses
 * (three only fires `'added'` on the directly-added node, never
 * descendants). {@link flatlandRegister} has the renderer in hand and
 * registers directly.
 */

/**
 * Prime-state key on the scene. `Symbol.for` for the same double-bundle
 * safety as the registry host symbol.
 */
const PRIME_SYMBOL = Symbol.for('three-flatland.prime')

interface ScenePrimeState {
  /** Sprites awaiting a renderer — drained by the chained scene hook. */
  pending: Set<Sprite2D>
  /** The installed chained hook — identity check for re-chaining. */
  installedHook: Scene['onBeforeRender'] | null
}

function getPrimeState(scene: Scene): ScenePrimeState {
  const holder = scene as unknown as Record<symbol, ScenePrimeState | undefined>
  let state = holder[PRIME_SYMBOL]
  if (!state) {
    state = { pending: new Set(), installedHook: null }
    holder[PRIME_SYMBOL] = state
  }
  return state
}

/**
 * Signal A entry point: record the sprite as pending on its scene and
 * make sure the chained `Scene.onBeforeRender` hook is installed.
 *
 * Sprites already owned by an explicit world (SpriteGroup / Flatland)
 * or already auto-registered are left alone.
 */
export function flatlandPrime(scene: Scene, sprite: Sprite2D): void {
  if (sprite._flatlandWorld || sprite._autoRegistry) return
  const state = getPrimeState(scene)
  state.pending.add(sprite)
  sprite._pendingPrimeScene = scene
  installSceneHook(scene, state)
}

/**
 * Signal B entry point: the renderer is known (the sprite is mid-draw),
 * register immediately and make sure the hook exists for subsequent
 * frames' orchestration.
 */
export function flatlandRegister(sprite: Sprite2D, renderer: RendererLike, scene: Scene): void {
  if (sprite._flatlandWorld || sprite._autoRegistry) return
  const state = getPrimeState(scene)
  installSceneHook(scene, state)
  const registry = getOrCreateRegistry(renderer, scene)
  registerSprite(registry, sprite)
}

/**
 * Remove a sprite from auto-orchestration (three's `'removed'` event).
 * Slot teardown happens through the ECS removal path once the sprite is
 * enrolled (auto-batch slice); here we drop the bookkeeping.
 */
export function flatlandUnregister(sprite: Sprite2D): void {
  const registry = sprite._autoRegistry
  if (registry) {
    registry.sprites.delete(sprite)
    registry.standalone.delete(sprite)
    registry._autoEvalDirty = true
    sprite._autoRegistry = null
    // Enrolled? Free the slot through the standard removal path and
    // resume own-mesh drawing (harmless if the sprite left the tree).
    if (sprite.entity) {
      sprite._unenrollFromWorld()
    }
    sprite._autoBatched = false
    sprite.visible = true
  }
  // Not yet drained from a pending set? Clear it there too.
  const scene = sprite._pendingPrimeScene
  if (scene) {
    const holder = scene as unknown as Record<symbol, ScenePrimeState | undefined>
    holder[PRIME_SYMBOL]?.pending.delete(sprite)
    sprite._pendingPrimeScene = null
  }
}

/**
 * Install the chained `Scene.onBeforeRender` (idempotent). The chain
 * preserves any user handler present at install time and calls it after
 * the orchestration sweep.
 */
function installSceneHook(scene: Scene, state: ScenePrimeState): void {
  // Re-chain when a user (or framework) assigned scene.onBeforeRender
  // AFTER our install — their handler replaced ours, so wrap it again.
  // Identity check keeps steady-state installs a single comparison.
  if (state.installedHook !== null && scene.onBeforeRender === state.installedHook) return

  // Preserve any real user handler present at install time. Comparing
  // against the prototype method skips a pointless indirect call per
  // render when the slot still holds three's no-op default.
  const protoOnBeforeRender = (Object.getPrototypeOf(scene) as Record<string, unknown>)[
    'onBeforeRender'
  ]
  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call(scene) in the chain
  const original = scene.onBeforeRender
  const hasOriginal = typeof original === 'function' && original !== protoOnBeforeRender

  const chainedFlatlandHook = function chainedFlatlandHook(
    renderer: WebGLRenderer,
    hookScene: Scene,
    camera: Camera,
    renderTarget: unknown
  ): void {
    flatlandSceneSweep(renderer as unknown as RendererLike, scene)
    if (hasOriginal) {
      ;(original as (...args: unknown[]) => void).call(
        scene,
        renderer,
        hookScene,
        camera,
        renderTarget
      )
    }
  } as Scene['onBeforeRender']

  state.installedHook = chainedFlatlandHook
  scene.onBeforeRender = chainedFlatlandHook
}

/**
 * The per-render-call orchestration sweep. Idempotent and re-entry safe
 * (shadow passes, XR, RTT re-render the same scene): with nothing
 * pending it's a map lookup and a size check.
 */
export function flatlandSceneSweep(renderer: RendererLike, scene: Scene): void {
  const state = getPrimeState(scene)
  const registry = state.pending.size > 0 ? getOrCreateRegistry(renderer, scene) : null

  if (registry) {
    for (const sprite of state.pending) {
      registerSprite(registry, sprite)
    }
    state.pending.clear()
  }

  // Threshold evaluation runs whenever standalone membership changed —
  // Signal-B registrations and removals mark the registry dirty for the
  // next sweep.
  const evalRegistry = registry ?? peekDirtyRegistry(renderer, scene)
  if (evalRegistry && evalRegistry._autoEvalDirty) {
    evaluateAutoBatch(evalRegistry)
  }

  if (registry || evalRegistry) {
    // Run the schedule now so this render call's projection picks up any
    // batching mutations (scene.updateMatrixWorld — the normal schedule
    // trigger — already ran earlier in this render call). The
    // scheduleRuns counter keeps this from double-running systems on
    // frames where nothing was pending.
    ;(registry ?? evalRegistry)!.group._runScheduleNow()
  }
}

/** Resolve an existing registry only when it has evaluation work queued. */
function peekDirtyRegistry(renderer: RendererLike, scene: Scene): Registry | null {
  const existing = peekRegistry(renderer, scene)
  return existing && existing._autoEvalDirty ? existing : null
}

/**
 * Threshold routing (the auto-batch activation): group unenrolled
 * sprites by their live run key and enroll every group that reaches 2 —
 * or whose run already has an active batch to join. N = 1 stays a
 * standalone Mesh: no batch overhead until a sibling shows up.
 *
 * Enrollment goes through the hidden SpriteGroup's add() (world
 * assignment, default-material resolution, ECS spawn); the next
 * schedule run assigns slots and hides the sprites' own meshes.
 */
export function evaluateAutoBatch(registry: Registry): void {
  registry._autoEvalDirty = false
  if (registry.standalone.size === 0) return

  const data = registry._registryData()
  const byRun = new Map<string, Sprite2D[]>()
  for (const sprite of registry.standalone) {
    if (sprite._renderOrderOverridden) continue // explicit escape hatch
    const key = computeRunKey(
      sprite.sortLayerValue,
      sprite.material.batchId,
      sprite.layers.mask
    )
    let bucket = byRun.get(key)
    if (!bucket) {
      bucket = []
      byRun.set(key, bucket)
    }
    bucket.push(sprite)
  }

  for (const [key, bucket] of byRun) {
    const runExists = data?.runs.has(key) ?? false
    if (bucket.length < 2 && !runExists) continue
    for (const sprite of bucket) {
      registry.standalone.delete(sprite)
      registry.group.add(sprite)
    }
  }
}

/**
 * Track a sprite in the registry. This slice is bookkeeping only — the
 * sprite keeps drawing via its own Mesh until the auto-batch slice
 * flips on enrollment/threshold routing.
 */
function registerSprite(registry: Registry, sprite: Sprite2D): void {
  if (sprite._autoRegistry === registry) return
  if (sprite._flatlandWorld && sprite._flatlandWorld !== registry.world) return

  attachOrchestratorGroup(registry)
  registry.sprites.add(sprite)
  sprite._autoRegistry = registry
  sprite._pendingPrimeScene = null

  // Resolve the bootstrap default to this registry's world-scoped
  // default so effect registration / dispose stay isolated per registry.
  if (sprite._materialIsBootstrapDefault && sprite.texture) {
    sprite._resolveDefaultMaterial(registry.getDefaultMaterial(sprite.texture))
  }

  // Queue for threshold evaluation — the sweep decides standalone vs
  // batched from the live run population.
  registry.standalone.add(sprite)
  registry._autoEvalDirty = true
}

/** Parent the hidden orchestrator group into the scene exactly once. */
function attachOrchestratorGroup(registry: Registry): void {
  if (registry.group.parent !== registry.scene) {
    registry.scene.add(registry.group)
  }
}
