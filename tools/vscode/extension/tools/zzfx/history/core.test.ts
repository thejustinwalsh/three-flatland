import { describe, expect, it } from 'vitest'
import type { ZzfxHistoryBatch } from '../../../../webview/zzfx/protocol'
import {
  HISTORY_MAX_BATCHES_PER_SOURCE,
  appendBatch,
  batchFromOutcome,
  batchesFor,
  clearSource,
  deleteCandidate,
  historyKeyFor,
  mergeForWrite,
  mergeHistoryFiles,
  parseHistoryFile,
  type HistoryFile,
} from './core'

function makeBatch(overrides: Partial<ZzfxHistoryBatch> = {}): ZzfxHistoryBatch {
  return {
    ts: 1000,
    category: 'Laser',
    styles: ['punchy'],
    source: 'lm',
    candidates: [
      { label: 'Zap A', params: [0.5, 0, 900], rationale: 'bright' },
      { label: 'Zap B', params: [0.5, 0, 1200], rationale: 'brighter' },
    ],
    ...overrides,
  }
}

describe('historyKeyFor', () => {
  it('keys a variable-spread call on its declaration (defUri + name), independent of the call line', () => {
    const a = historyKeyFor({
      uri: 'file:///w/src/sounds.ts',
      line: 52,
      varRef: { name: 'LASER', defUri: 'file:///w/src/sounds.ts' },
    })
    const b = historyKeyFor({
      uri: 'file:///w/src/sounds.ts',
      line: 99, // call moved — same sound, same history
      varRef: { name: 'LASER', defUri: 'file:///w/src/sounds.ts' },
    })
    expect(a).toBe(b)
    expect(a).toContain('LASER')
  })

  it('keys a literal call on uri + line, so different call sites have independent histories', () => {
    const a = historyKeyFor({ uri: 'file:///w/src/sounds.ts', line: 48 })
    const b = historyKeyFor({ uri: 'file:///w/src/sounds.ts', line: 49 })
    expect(a).not.toBe(b)
  })

  it('treats a varRef without defUri as a literal (no declaration identity to key on)', () => {
    const withName = historyKeyFor({
      uri: 'file:///w/a.ts',
      line: 3,
      varRef: { name: 'X' },
    })
    const literal = historyKeyFor({ uri: 'file:///w/a.ts', line: 3 })
    expect(withName).toBe(literal)
  })

  it('never collides a variable key with a literal key for the same file', () => {
    const varKey = historyKeyFor({
      uri: 'file:///w/a.ts',
      line: 3,
      varRef: { name: '3', defUri: 'file:///w/a.ts' },
    })
    const litKey = historyKeyFor({ uri: 'file:///w/a.ts', line: 3 })
    expect(varKey).not.toBe(litKey)
  })
})

describe('batchFromOutcome', () => {
  it('builds a persistable batch for an lm outcome', () => {
    const batch = batchFromOutcome(
      { source: 'lm', candidates: makeBatch().candidates },
      { category: 'Laser', styles: ['punchy', 'high'] },
      42
    )
    expect(batch).toEqual({
      ts: 42,
      category: 'Laser',
      styles: ['punchy', 'high'],
      source: 'lm',
      candidates: makeBatch().candidates,
    })
  })

  it('persists cache outcomes too (replayed LM output the user asked for again)', () => {
    const batch = batchFromOutcome(
      { source: 'cache', candidates: makeBatch().candidates },
      { category: 'Laser', styles: [] },
      42
    )
    expect(batch?.source).toBe('cache')
  })

  it('returns null for preset outcomes and empty candidate lists', () => {
    expect(
      batchFromOutcome(
        { source: 'preset', candidates: makeBatch().candidates },
        { category: 'Laser', styles: [] },
        42
      )
    ).toBeNull()
    expect(
      batchFromOutcome({ source: 'lm', candidates: [] }, { category: 'Laser', styles: [] }, 42)
    ).toBeNull()
  })
})

describe('appendBatch', () => {
  it('appends oldest-first without mutating the input file', () => {
    const file: HistoryFile = { k: [makeBatch({ ts: 1 })] }
    const next = appendBatch(file, 'k', makeBatch({ ts: 2 }))
    expect(next.k!.map((b) => b.ts)).toEqual([1, 2])
    expect(file.k).toHaveLength(1)
  })

  it('nudges a colliding timestamp forward so ts stays a unique delete-address within the source', () => {
    let file: HistoryFile = {}
    file = appendBatch(file, 'k', makeBatch({ ts: 5 }))
    file = appendBatch(file, 'k', makeBatch({ ts: 5 }))
    file = appendBatch(file, 'k', makeBatch({ ts: 3 })) // clock went backwards — still unique
    expect(file.k!.map((b) => b.ts)).toEqual([5, 6, 7])
  })

  it(`prunes to the newest ${HISTORY_MAX_BATCHES_PER_SOURCE} batches per source`, () => {
    let file: HistoryFile = {}
    for (let i = 0; i < HISTORY_MAX_BATCHES_PER_SOURCE + 3; i++) {
      file = appendBatch(file, 'k', makeBatch({ ts: i * 10 }))
    }
    expect(file.k).toHaveLength(HISTORY_MAX_BATCHES_PER_SOURCE)
    expect(file.k![0]!.ts).toBe(30) // the three oldest (0,10,20) pruned
    expect(file.k![file.k!.length - 1]!.ts).toBe((HISTORY_MAX_BATCHES_PER_SOURCE + 2) * 10)
  })

  it('keeps other sources untouched', () => {
    const file: HistoryFile = { other: [makeBatch({ ts: 1 })] }
    const next = appendBatch(file, 'k', makeBatch({ ts: 2 }))
    expect(next.other).toEqual(file.other)
  })
})

describe('deleteCandidate', () => {
  it('removes exactly the addressed candidate', () => {
    const file: HistoryFile = { k: [makeBatch({ ts: 7 })] }
    const next = deleteCandidate(file, 'k', 7, 0)
    expect(next.k![0]!.candidates.map((c) => c.label)).toEqual(['Zap B'])
  })

  it('drops a batch emptied by the removal, and the key when its last batch goes', () => {
    const oneCandidate = makeBatch({ ts: 7, candidates: [makeBatch().candidates[0]!] })
    const file: HistoryFile = { k: [oneCandidate], other: [makeBatch({ ts: 1 })] }
    const next = deleteCandidate(file, 'k', 7, 0)
    expect(next.k).toBeUndefined()
    expect(next.other).toEqual(file.other)
  })

  it('is a no-op for an unknown batchTs, an out-of-range index, or an unknown key', () => {
    const file: HistoryFile = { k: [makeBatch({ ts: 7 })] }
    expect(deleteCandidate(file, 'k', 999, 0)).toEqual(file)
    expect(deleteCandidate(file, 'k', 7, 99)).toEqual(file)
    expect(deleteCandidate(file, 'k', 7, -1)).toEqual(file)
    expect(deleteCandidate(file, 'missing', 7, 0)).toBe(file)
  })
})

describe('clearSource', () => {
  it('drops only the addressed source', () => {
    const file: HistoryFile = { k: [makeBatch()], other: [makeBatch({ ts: 2 })] }
    const next = clearSource(file, 'k')
    expect(next.k).toBeUndefined()
    expect(next.other).toEqual(file.other)
  })

  it('is a no-op for an unknown key', () => {
    const file: HistoryFile = { other: [makeBatch()] }
    expect(clearSource(file, 'missing')).toBe(file)
  })
})

describe('batchesFor', () => {
  it('returns newest-first without mutating the stored oldest-first order', () => {
    const file: HistoryFile = { k: [makeBatch({ ts: 1 }), makeBatch({ ts: 2 })] }
    expect(batchesFor(file, 'k').map((b) => b.ts)).toEqual([2, 1])
    expect(file.k!.map((b) => b.ts)).toEqual([1, 2])
    expect(batchesFor(file, 'missing')).toEqual([])
  })
})

describe('parseHistoryFile', () => {
  it('round-trips what appendBatch wrote', () => {
    const file = appendBatch({}, 'k', makeBatch())
    expect(parseHistoryFile(JSON.stringify(file))).toEqual(file)
  })

  it('degrades corrupt text and non-object roots to an empty file', () => {
    expect(parseHistoryFile('not json {')).toEqual({})
    expect(parseHistoryFile('null')).toEqual({})
    expect(parseHistoryFile('[1,2]')).toEqual({})
    expect(parseHistoryFile('')).toEqual({})
    expect(parseHistoryFile(undefined)).toEqual({})
  })

  it('drops individually-corrupt keys without losing the valid ones', () => {
    const good = appendBatch({}, 'good', makeBatch())
    const text = JSON.stringify({
      ...good,
      junk: 'not an array',
      badBatch: [{ ts: 'nope' }],
      badSource: [{ ...makeBatch(), source: 'preset' }],
    })
    expect(parseHistoryFile(text)).toEqual(good)
  })
})

describe('mergeHistoryFiles', () => {
  it('lets the in-memory map win per key while preserving disk-only keys', () => {
    const onDisk: HistoryFile = {
      shared: [makeBatch({ ts: 1 })],
      diskOnly: [makeBatch({ ts: 2 })],
    }
    const inMemory: HistoryFile = { shared: [makeBatch({ ts: 3 })] }
    const merged = mergeHistoryFiles(onDisk, inMemory)
    expect(merged.shared![0]!.ts).toBe(3)
    expect(merged.diskOnly).toEqual(onDisk.diskOnly)
  })
})

describe('mergeForWrite', () => {
  it('does not resurrect a key this write deleted, while keeping other-process keys', () => {
    // Simulates: this process cleared 'k' (so it's gone from memory),
    // while another window wrote both a stale 'k' and a new 'theirs'
    // to disk since our load.
    const onDisk: HistoryFile = { k: [makeBatch({ ts: 1 })], theirs: [makeBatch({ ts: 2 })] }
    const inMemory: HistoryFile = { mine: [makeBatch({ ts: 3 })] }
    const merged = mergeForWrite(onDisk, inMemory, 'k')
    expect(merged.k).toBeUndefined()
    expect(merged.theirs).toEqual(onDisk.theirs)
    expect(merged.mine).toEqual(inMemory.mine)
  })

  it('behaves exactly like mergeHistoryFiles when the written key is present in memory', () => {
    const onDisk: HistoryFile = { k: [makeBatch({ ts: 1 })] }
    const inMemory: HistoryFile = { k: [makeBatch({ ts: 9 })] }
    expect(mergeForWrite(onDisk, inMemory, 'k')).toEqual(mergeHistoryFiles(onDisk, inMemory))
  })
})
