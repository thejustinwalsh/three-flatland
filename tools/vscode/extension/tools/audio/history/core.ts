// ALL the AI-candidate-history decisions, zero `vscode` import (same
// split as ../lm/core.ts): keying, append/prune, delete/clear, corrupt-
// file degrade, and the read-merge-write merge. `store.ts` is the thin
// vscode.workspace.fs glue around these. Wire types are shared with the
// webview via protocol.ts — the store persists exactly what the panel
// renders.
import type { ZzfxHistoryBatch } from '../../../../webview/audio/protocol'

export type HistoryFile = Record<string, ZzfxHistoryBatch[]>

/**
 * Newest batches kept per source; older ones prune on append. 10 batches
 * × 4 candidates is ~2 screens of history — enough that a paid-for sound
 * from earlier in a session is still there, small enough that the store
 * file stays trivial even across many sources.
 */
export const HISTORY_MAX_BATCHES_PER_SOURCE = 10

/**
 * The history key is the SAME source identity the header link shows
 * (Z13): a variable-spread call keys on its declaration (`defUri` +
 * variable name — stable across call-site edits, and shared by every
 * call spreading that variable, which is the point: the history follows
 * the SOUND); a literal call keys on `uri` + its open-time line. The key
 * is identity, not a live pointer — if a literal call's line drifts,
 * new opens key to the new line and the old entries simply stop showing
 * (staleness is acceptable; nothing dangles, nothing is written through
 * a stale key). Identity needs only `defUri` + name, deliberately NOT
 * `defRange` — an unreadable initializer doesn't change which sound this
 * is.
 */
export function historyKeyFor(source: {
  uri: string
  line: number
  varRef?: { name: string; defUri?: string }
}): string {
  if (source.varRef?.defUri) return `var:${source.varRef.defUri}#${source.varRef.name}`
  return `lit:${source.uri}#${source.line}`
}

/**
 * Builds the batch a generate outcome should persist, or `null` when the
 * outcome shouldn't be persisted at all: preset results are free and
 * deterministic (the library ships in every init payload), so storing
 * them would only dilute the paid-for LM history; an empty candidate
 * list has nothing to keep. Cache results ARE persisted — they're
 * replayed LM output the user asked for again.
 */
export function batchFromOutcome(
  outcome: { source: 'lm' | 'cache' | 'preset'; candidates: ZzfxHistoryBatch['candidates'] },
  args: { category: string; styles: readonly string[] },
  now: number
): ZzfxHistoryBatch | null {
  if (outcome.source === 'preset' || outcome.candidates.length === 0) return null
  return {
    ts: now,
    category: args.category,
    styles: [...args.styles],
    source: outcome.source,
    candidates: outcome.candidates,
  }
}

/**
 * Appends `batch` to `key`'s history (stored oldest-first) and prunes to
 * the newest `maxBatches`. `ts` doubles as the batch's delete-address, so
 * a same-millisecond collision nudges it forward to stay unique within
 * the source. Returns a new file object; never mutates the input.
 */
export function appendBatch(
  file: HistoryFile,
  key: string,
  batch: ZzfxHistoryBatch,
  maxBatches: number = HISTORY_MAX_BATCHES_PER_SOURCE
): HistoryFile {
  const existing = file[key] ?? []
  const lastTs = existing.length > 0 ? existing[existing.length - 1]!.ts : -Infinity
  const ts = batch.ts > lastTs ? batch.ts : lastTs + 1
  const batches = [...existing, { ...batch, ts }]
  return { ...file, [key]: batches.slice(Math.max(0, batches.length - maxBatches)) }
}

/**
 * Removes one candidate, addressed by its batch's `ts` + index within
 * the batch. A batch emptied by the removal disappears entirely; an
 * unknown `batchTs`/out-of-range index is a no-op (the webview's view
 * may lag a write from another window — deleting something already gone
 * shouldn't throw). Returns a new file object.
 */
export function deleteCandidate(
  file: HistoryFile,
  key: string,
  batchTs: number,
  index: number
): HistoryFile {
  const batches = file[key]
  if (!batches) return file
  const next = batches.flatMap((batch) => {
    if (batch.ts !== batchTs) return [batch]
    if (index < 0 || index >= batch.candidates.length) return [batch]
    const candidates = batch.candidates.filter((_, i) => i !== index)
    return candidates.length > 0 ? [{ ...batch, candidates }] : []
  })
  if (next.length === 0) {
    const { [key]: _removed, ...rest } = file
    return rest
  }
  return { ...file, [key]: next }
}

/** Drops `key`'s history entirely; other sources untouched. */
export function clearSource(file: HistoryFile, key: string): HistoryFile {
  if (!(key in file)) return file
  const { [key]: _removed, ...rest } = file
  return rest
}

/** `key`'s batches, newest-first — the order the panel renders. */
export function batchesFor(file: HistoryFile, key: string): ZzfxHistoryBatch[] {
  return [...(file[key] ?? [])].reverse()
}

function isValidBatch(value: unknown): value is ZzfxHistoryBatch {
  if (typeof value !== 'object' || value === null) return false
  const batch = value as Record<string, unknown>
  return (
    typeof batch.ts === 'number' &&
    typeof batch.category === 'string' &&
    Array.isArray(batch.styles) &&
    batch.styles.every((style) => typeof style === 'string') &&
    (batch.source === 'lm' || batch.source === 'cache') &&
    Array.isArray(batch.candidates) &&
    batch.candidates.every(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof (candidate as Record<string, unknown>).label === 'string' &&
        Array.isArray((candidate as Record<string, unknown>).params)
    )
  )
}

/**
 * Parses the on-disk JSON into a {@link HistoryFile}, degrading rather
 * than crashing (same policy as the LM cache and the codelens sidecar's
 * db): unparseable text or a non-object root yields `{}`; a key whose
 * value isn't a valid batch array is dropped individually so one
 * corrupted entry doesn't cost the rest. Losing history is a persistence
 * problem, never a panel crash.
 */
export function parseHistoryFile(text: string | null | undefined): HistoryFile {
  if (!text) return {}
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: HistoryFile = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value) && value.every(isValidBatch)) out[key] = value
  }
  return out
}

/**
 * Read-merge-write merge (same shape as the LM cache's, #148 Z7b Finding
 * B): per-key, the in-memory map wins — this process's writes always
 * survive — while keys only another process touched (a second VS Code
 * window sharing the globalStorageUri) are preserved instead of
 * clobbered. Two truly simultaneous writers to the SAME key still race;
 * the failure mode this closes is "last writer erases every OTHER key".
 */
export function mergeHistoryFiles(onDisk: HistoryFile, inMemory: HistoryFile): HistoryFile {
  return { ...onDisk, ...inMemory }
}

/**
 * The write-path merge: {@link mergeHistoryFiles}, plus one rule the
 * plain spread can't express — when this write's own operation DELETED
 * `writtenKey` (clear, or the last candidate's removal drops the key
 * from `inMemory` entirely), the disk copy must not resurrect it.
 */
export function mergeForWrite(
  onDisk: HistoryFile,
  inMemory: HistoryFile,
  writtenKey: string
): HistoryFile {
  const merged = mergeHistoryFiles(onDisk, inMemory)
  if (!(writtenKey in inMemory) && writtenKey in merged) {
    const { [writtenKey]: _removed, ...rest } = merged
    return rest
  }
  return merged
}
