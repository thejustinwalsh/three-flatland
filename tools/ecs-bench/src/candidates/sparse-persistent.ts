import type { EcsAdapter } from '../adapter.ts'
import { createCandidateAdapter } from './shared.ts'

/** Sparse trait membership with incrementally maintained selector sets. */
export function createSparsePersistentAdapter(): EcsAdapter {
  return createCandidateAdapter('sparse-persistent')
}
