// Pure index/order math for the region list's PRESENTATION order versus
// the descriptor's SERIALIZATION order. Split out of RegionListPanel.tsx
// so the tricky remove-then-insert arithmetic gets unit tests without
// mounting the component.
//
// Descriptor order (what's saved to .normal.json and what bakeRegions
// paints in, see packages/normals/src/bake.ts's bakeNormalMap loop):
// index 0 paints FIRST, the LAST index wins any overlapping pixels.
//
// Presentation order (what the Regions panel renders top-to-bottom):
// the REVERSE of descriptor order — top of the list is the region that
// paints LAST (wins), matching the "top layer wins" intuition from
// Photoshop/Figma-style layer panels rather than the raw array order,
// which would put the winner at the bottom.
//
// `reorderRegion` (regionOps.ts) operates on DESCRIPTOR indices and
// expects `toIndex` as the FINAL index the moved item should occupy
// AFTER the move — not a raw splice-insert position. It internally does
// `adjusted = toIndex > fromIndex ? toIndex - 1 : toIndex` to compensate
// for the fact that removing the item first shifts every later index
// back by one. Every "move" helper below produces args in that same
// final-index sense, then converts to reorderRegion's raw-toIndex
// convention via `descriptorMoveArgs`.

/** Reverses descriptor-order items into presentation (layers-panel) order. Self-inverse — applying it twice returns the original order. */
export function toPresentationOrder<T>(items: readonly T[]): T[] {
  return [...items].reverse()
}

/**
 * Converts an index between presentation order and descriptor order.
 * Self-inverse (same formula both directions) because presentation
 * order is a straight reversal of descriptor order.
 */
export function presentationToDescriptorIndex(index: number, length: number): number {
  return length - 1 - index
}

/**
 * Given a descriptor-order "move to this FINAL index" request, returns
 * the (fromIndex, toIndex) pair `reorderRegion` expects — converting
 * from "final landing index" to reorderRegion's raw-toIndex convention
 * (see this file's header comment for why they differ for forward moves).
 */
export function descriptorMoveArgs(
  fromDescriptorIndex: number,
  toDescriptorIndexFinal: number
): { fromIndex: number; toIndex: number } {
  const toIndex = toDescriptorIndexFinal > fromDescriptorIndex ? toDescriptorIndexFinal + 1 : toDescriptorIndexFinal
  return { fromIndex: fromDescriptorIndex, toIndex }
}

/**
 * Up/down button move, expressed in PRESENTATION terms: 'up' moves the
 * region one slot toward the top of the list (later paint / bigger
 * winner); 'down' moves it one slot toward the bottom (earlier paint /
 * bigger loser). Takes the region's current DESCRIPTOR index (which is
 * what the caller already has — `regions.findIndex` or similar) and
 * returns the `reorderRegion` args directly.
 */
export function presentationStepMoveArgs(
  descriptorIndex: number,
  direction: 'up' | 'down'
): { fromIndex: number; toIndex: number } {
  const toDescriptorIndexFinal = direction === 'up' ? descriptorIndex + 1 : descriptorIndex - 1
  return descriptorMoveArgs(descriptorIndex, toDescriptorIndexFinal)
}

/**
 * Drag-and-drop move: "take the row currently at presentation index
 * `fromPresentationIndex` and drop it immediately BEFORE the row
 * currently at presentation index `dropBeforeIndex`" (a `dropBeforeIndex`
 * of `length` means "drop at the very end of the list", i.e. the new
 * bottom / earliest-paint / biggest-loser slot). `dropBeforeIndex` is
 * expressed against the PRE-drag presentation array, same as how a drop
 * indicator's position is measured before anything moves.
 */
export function presentationDragMoveArgs(
  fromPresentationIndex: number,
  dropBeforeIndex: number,
  length: number
): { fromIndex: number; toIndex: number } {
  // What FINAL presentation index does the dragged row land at? Same
  // remove-then-insert adjustment reorderRegion applies internally, one
  // layer up in presentation space: removing the dragged row shifts
  // every later presentation index back by one before the drop position
  // is actually occupied.
  const pToFinal = dropBeforeIndex > fromPresentationIndex ? dropBeforeIndex - 1 : dropBeforeIndex
  const dFrom = presentationToDescriptorIndex(fromPresentationIndex, length)
  const dToFinal = presentationToDescriptorIndex(pToFinal, length)
  return descriptorMoveArgs(dFrom, dToFinal)
}
