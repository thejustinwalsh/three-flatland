// D6 (ORCHESTRATOR RULING): the ONE place paragraph space meets world
// space. Slug paragraph space puts the origin at the block's top-left with
// +y DOWN (see src/text/types.ts); three.js object space is +y up. Every
// renderer converts through this helper — never inline the negation, and
// never re-derive baseline math outside `baseline.ts` next door.

/**
 * Convert a paragraph-space y (+y down, origin at the block's top-left)
 * to three.js object-space y (+y up, same origin).
 */
export function paragraphYToWorldY(paragraphY: number): number {
  // D6: the single paragraph-space → world-space y flip.
  return -paragraphY
}
