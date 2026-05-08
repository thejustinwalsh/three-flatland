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
export type ActionKind = 'none' | 'collect' | 'brace' | 'trigger' | 'pet'

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
})

/**
 * Sliding window of recent pet ticks. If size > OVER_PET_THRESHOLD within
 * OVER_PET_WINDOW_TICKS, the next pet flips polarity to annoyance: Fear ↑,
 * AI scoots, Animation = 'trip'.
 */
export const PetEvents = trait({
  recentTicks: () => [] as number[],
})
