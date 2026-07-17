/**
 * Pure staleness fingerprinting for the Vite plugin's bake cache. Given
 * per-source content hashes and the bake options that will be applied,
 * derive a single digest — an unchanged digest across two plugin runs
 * means the cached bake output is still valid. No I/O in this module
 * (callers hash file bytes themselves), so it's cheap to unit test.
 */
import { createHash } from 'node:crypto'
import type { BakeAtlasOptions } from './bake'

export interface StalenessSource {
  /** Source identifier — the atlas frame key (basename without extension). */
  name: string
  /** SHA-256 hex digest of the source file's bytes. */
  contentHash: string
}

/** SHA-256 hex digest of a byte buffer — fingerprints a source file's contents. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Fingerprint an entry's inputs: source content hashes (order-independent —
 * sorted by name before hashing) plus the bake options that will be
 * applied. Two calls with the same sources and options always produce the
 * same digest, regardless of array order.
 */
export function computeStalenessHash(
  sources: StalenessSource[],
  bakeOptions: BakeAtlasOptions
): string {
  const hash = createHash('sha256')
  const sorted = [...sources].sort((a, b) => a.name.localeCompare(b.name))
  for (const source of sorted) {
    hash.update(source.name)
    hash.update('\0')
    hash.update(source.contentHash)
    hash.update('\0')
  }
  const keys = Object.keys(bakeOptions).sort()
  hash.update(JSON.stringify(bakeOptions, keys))
  return hash.digest('hex')
}
