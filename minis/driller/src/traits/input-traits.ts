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
export type ActionKind = 'none' | 'collect' | 'brace' | 'trigger' | 'pet' | 'shake' | 'paint' | 'drag'

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
   * Wiggle-shake state. While the pointer is held down on a stable rock,
   * `wiggleCol/Row` lock to that cell and `wiggleDistance` accumulates
   * raw pointer-pixel travel. When the total crosses WIGGLE_THRESHOLD_PX
   * the shake action commits. Reset on pointer-up or hover-cell change.
   */
  wiggleCol: -1,
  wiggleRow: -1,
  wiggleDistance: 0,
  /**
   * Hold-and-drag state. Set when the pointer presses down on a chunk
   * that's currently in SHAKE or FALLING phase; while non-zero, the
   * pointer system follows the cursor and moves the chunk's cells.
   * `dragHeldSinceTick` drives the per-tick cost ramp.
   */
  dragEntity: 0,
  dragHeldSinceTick: 0,
  dragLastCostTick: 0,
})

/**
 * Sliding window of recent pet ticks. If size > OVER_PET_THRESHOLD within
 * OVER_PET_WINDOW_TICKS, the next pet flips polarity to annoyance: Fear ↑,
 * AI scoots, Animation = 'trip'.
 */
export const PetEvents = trait({
  recentTicks: () => [] as number[],
})
