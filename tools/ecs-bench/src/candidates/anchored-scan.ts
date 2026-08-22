import type { EcsAdapter } from '../adapter.ts'
import { createCandidateAdapter } from './shared.ts'

/** Sparse trait membership with a reusable smallest-trait intersection scratch view. */
export function createAnchoredScanAdapter(): EcsAdapter {
  return createCandidateAdapter('anchored-scan')
}
