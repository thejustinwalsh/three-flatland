import type { EcsAdapter } from '../adapter.ts'
import { createCandidateAdapter } from './shared.ts'

/** Per-entity signature words with incrementally maintained selector sets. */
export function createSignaturePersistentAdapter(): EcsAdapter {
  return createCandidateAdapter('signature-persistent')
}
