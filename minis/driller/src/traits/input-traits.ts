import { trait } from 'koota'

/**
 * The action that would fire if the user clicked at the current cursor
 * position. Resolved each frame from cursor → world cell → priority zone.
 *
 * Zone priority (high → low):
 *   1. driller cell                    → 'pet'
 *   2. cell containing a visible gem   → 'collect'
 *   3. cell inside a sagging chunk     → 'brace'
 *   4. cell above driller in intact soil → 'trigger'
 *   5. anything else                   → 'none'
 */
export type ActionKind = 'none' | 'collect' | 'brace' | 'trigger' | 'pet' | 'paint' | 'drag'

/**
 * Pointer state. Updated by DOM event handlers in the input system.
 */
export const Pointer = trait({
  /** Canvas-space pixel of the cursor. */
  px: 0,
  py: 0,
  /** True while a pointer is pressed (mouse down or finger touching). */
  active: false,
  /** Resolved hover action — drives cursor color and click commit. */
  hoverAction: 'none' as ActionKind,
  /** Cell the cursor is over (used by Brace, Trigger, Collect arc target). */
  hoverTargetCol: 0,
  hoverTargetRow: 0,
  /** Entity id of the gem currently under the cursor (0 = none). */
  hoverGemEntity: 0,
  /**
   * Mode lock — what action was bound at pointerdown. The held-tick
   * loop refuses to switch modes mid-press, so dragging the cursor
   * from a paint-resolved soil cell onto a drag-resolved falling
   * chunk doesn't accidentally start dragging. Cleared on pointer-up.
   */
  lockedAction: 'none' as ActionKind,
  /**
   * Hold-and-drag bookkeeping. Set on pointerdown over a SHAKING /
   * FALLING cell; cleared on pointer-up. The actual drag state lives
   * on the singleton `Drag` trait — these fields are duplicate
   * tracking kept on Pointer for the dragSystem's accounting.
   */
  dragEntity: 0,
  dragHeldSinceTick: 0,
  dragLastCostTick: 0,
  /**
   * Gem-collect cooldown: the tick after which the next gem collect
   * is allowed. Prevents 60Hz auto-clicker farming during gameplay.
   * Bypassed entirely while the driller is in the void band (the
   * gem bonus zone is meant to be a click-frenzy free-for-all).
   */
  collectCooldownUntilTick: 0,
})

/**
 * Floating "-N + gem" popup spawned every time gems are spent. The
 * renderer reads `startTick` against `GEM_SPEND_POPUP_TTL_TICKS` to
 * animate scale (pop), Y offset (rise), and alpha (fade). Stacking
 * rule: a second spend at the same cell within
 * `GEM_SPEND_POPUP_STACK_WINDOW` ticks increments `amount` on the
 * existing entity instead of spawning a new one — without this, a
 * held paint drag would spawn one popup per game tick.
 */
export const GemSpendPopup = trait({
  col: 0,
  row: 0,
  amount: 1,
  startTick: 0,
})

/**
 * Brief "you over-petted me" indicator. Spawned when the player taps
 * the driller past the over-pet threshold; renders an angry mood
 * icon over the driller's cell with horizontal shake for
 * `OVER_PET_SHAKE_TICKS` ticks, then destroys itself. Conveys
 * cursor-rejection: the pause is instantly cleared (driller bolts)
 * but the visual confirms WHY.
 */
export const OverPetIndicator = trait({
  col: 0,
  row: 0,
  startTick: 0,
})

/**
 * Sliding window of recent pet ticks. If size > OVER_PET_THRESHOLD within
 * OVER_PET_WINDOW_TICKS, the next pet flips polarity to annoyance: Fear ↑,
 * AI scoots, Animation = 'trip'.
 */
export const PetEvents = trait({
  recentTicks: () => [] as number[],
})

/**
 * Active drag state. Singleton trait — only one drag at a time.
 * `clusterId === 0` means no drag in progress; otherwise the trait
 * holds the cluster being moved and the pointer cell at the moment
 * the cluster was last successfully translated.
 *
 * Gem cost accrues across `DRAG_COST_INTERVAL_TICKS` intervals. Each
 * crossed interval bills `DRAG_COST_PER_INTERVAL +
 * intervalIdx * DRAG_COST_SCALE_PER_INTERVAL` gems — so holding for
 * 5 seconds costs 1 + 2 + 3 + 4 + 5 = 15 gems total. The cost-ramp
 * is the primary tuning lever for how long a drag is feasible.
 */
export const Drag = trait({
  clusterId: 0,
  anchorCol: 0,
  anchorRow: 0,
  startTick: 0,
  intervalsCharged: 0,
})
