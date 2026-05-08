import { trait } from 'koota'

/**
 * One Explosive entity per TILE_EXPLOSIVE cell. Tracks fuse state.
 *
 * `triggered` is set by the explosive system when the driller enters the
 * 8-neighbor adjacency. `fuseRemaining` ticks down from
 * EXPLOSIVE_FUSE_TICKS; on 0 the cell explodes (5×5 to AIR, gems destroyed,
 * adjacent explosives chain-trigger).
 */
export const Explosive = trait({
  col: 0,
  row: 0,
  triggered: false,
  fuseRemaining: 0,
})
