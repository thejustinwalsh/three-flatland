import type { Camera, Scene, WebGLRenderer } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import { Registry, getOrCreateRegistry, type RendererLike } from './registry'

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
  /** Idempotency marker for the chained hook install. */
  hookInstalled: boolean
}

function getPrimeState(scene: Scene): ScenePrimeState {
  const holder = scene as unknown as Record<symbol, ScenePrimeState | undefined>
  let state = holder[PRIME_SYMBOL]
  if (!state) {
    state = { pending: new Set(), hookInstalled: false }
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
    sprite._autoRegistry = null
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
  if (state.hookInstalled) return
  state.hookInstalled = true

  // Preserve any real user handler present at install time. Comparing
  // against the prototype method skips a pointless indirect call per
  // render when the slot still holds three's no-op default.
  const proto = Object.getPrototypeOf(scene) as { onBeforeRender?: Scene['onBeforeRender'] }
  const original = scene.onBeforeRender
  const hasOriginal =
    typeof original === 'function' && original !== proto?.onBeforeRender

  scene.onBeforeRender = function chainedFlatlandHook(
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
}

/**
 * The per-render-call orchestration sweep. Idempotent and re-entry safe
 * (shadow passes, XR, RTT re-render the same scene): with nothing
 * pending it's a map lookup and a size check.
 */
export function flatlandSceneSweep(renderer: RendererLike, scene: Scene): void {
  const state = getPrimeState(scene)
  if (state.pending.size === 0) return

  const registry = getOrCreateRegistry(renderer, scene)
  for (const sprite of state.pending) {
    registerSprite(registry, sprite)
  }
  state.pending.clear()

  // Run the schedule now so this render call's projection picks up any
  // batching mutations (scene.updateMatrixWorld — the normal schedule
  // trigger — already ran earlier in this render call). The
  // scheduleRuns counter keeps this from double-running systems on
  // frames where nothing was pending.
  registry.group.update()
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
}

/** Parent the hidden orchestrator group into the scene exactly once. */
function attachOrchestratorGroup(registry: Registry): void {
  if (registry.group.parent !== registry.scene) {
    registry.scene.add(registry.group)
  }
}
