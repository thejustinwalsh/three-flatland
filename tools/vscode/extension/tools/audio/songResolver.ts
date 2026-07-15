// Pure text-shape parsing for a `zzfxm.song` finding's actual `Song` object
// (instruments, patterns, sequence, bpm?) — mirrors `numberArrayLiteral.ts`'s
// split from `resolveParams.ts`: no `vscode` import at module scope, so this
// file is unit-testable under plain vitest. `resolveSong.ts` is the
// `vscode`-dependent document-read half (e2e-covered only, same posture as
// `resolveParams`), which imports `parseSongLiteralText` from here.
//
// `zzfxm.song`'s payload has NO `params` — a song is a deeply nested array,
// not a flat numeric list (tools/codelens-service/CLAUDE.md), so unlike
// zzfx.call there is always real source text to read and parse, whether the
// call site is a literal or a variable reference.
//
// Two real call shapes this must handle (see `tools/codelens-service/
// fixtures/golden/golden.ts` for the syntactic forms; the Rust scanner
// resolves `varRef` for both a BARE identifier first argument and a SPREAD
// of one — `zzfxM(...songVar)`, the canonical zzfxm-tool output shape —
// see `sidecar/src/parse.rs::extract_zzfxm_call`'s doc comment, so both
// land on shape 2 below. A spread of anything else never resolves a
// varRef, and its raw `argRange` text fails the nested-array-literal
// grammar, producing a graceful `loadError` rather than a crash):
//
//   1. Positional literal call — `zzfxm(instrumentsLit, patternsLit,
//      sequenceLit, bpmLit?)`. `argRange` covers the raw, comma-separated
//      argument-list text. Wrapping it in `[...]` and parsing yields an
//      outer array whose 3-4 elements ARE `[instruments, patterns,
//      sequence, bpm?]` directly.
//   2. Bare-identifier var-ref call — `zzfxm(songVar)` where `songVar`'s
//      declaration is a SINGLE combined array `[instruments, patterns,
//      sequence, bpm?]`. `varRef.defRange` covers exactly that array's
//      text. Wrapping IT in `[...]` yields an outer array with exactly ONE
//      element — the combined tuple — which must be unwrapped one level
//      before destructuring.
//
// `parseSongLiteralText` handles both shapes uniformly: wrap, parse, then
// pick the 3-4-element tuple from either the outer array directly (shape 1)
// or its sole element (shape 2).
import type { Song } from '@three-flatland/audio-play'
import { parseNestedArrayLiteral, type NestedArrayValue } from './numberArrayLiteral'

export type ResolvedSong = { song: Song } | { loadError: string }

function previewText(text: string, max = 40): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function toNumberArray(value: NestedArrayValue | undefined): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: number[] = []
  for (const leaf of value) {
    if (typeof leaf !== 'number') return undefined
    out.push(leaf)
  }
  return out
}

/** `Instrument[]` — each instrument is a flat ZzFX params array. */
function toInstruments(value: NestedArrayValue | undefined): number[][] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: number[][] = []
  for (const instrument of value) {
    const arr = toNumberArray(instrument)
    if (!arr) return undefined
    out.push(arr)
  }
  return out
}

/** `Pattern[]` — each pattern is `Channel[]`, each channel a flat number array. */
function toPatterns(value: NestedArrayValue | undefined): number[][][] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: number[][][] = []
  for (const pattern of value) {
    if (!Array.isArray(pattern)) return undefined
    const channels: number[][] = []
    for (const channel of pattern) {
      const arr = toNumberArray(channel)
      if (!arr) return undefined
      channels.push(arr)
    }
    out.push(channels)
  }
  return out
}

/**
 * Picks the `[instruments, patterns, sequence, bpm?]` tuple out of a
 * wrapped-and-parsed `outer` array — either the array itself (the true
 * positional-call shape, 3-4 top-level elements) or its sole element (the
 * single-combined-array shape a bare-identifier var-ref reads), see the
 * file doc comment. `null` for anything else — neither shape matched.
 */
function destructureSongTuple(outer: NestedArrayValue[]): NestedArrayValue[] | null {
  if (outer.length === 1 && Array.isArray(outer[0])) {
    const inner = outer[0]
    return inner.length === 3 || inner.length === 4 ? inner : null
  }
  if (outer.length === 3 || outer.length === 4) return outer
  return null
}

/**
 * Pure: parses `text` (the raw source text at either `argRange` or
 * `varRef.defRange`, see the file doc comment for which) into a `Song`, or
 * a `loadError` naming `label` (the variable name for a var-ref call, or a
 * generic "this zzfxm() call" description for a literal one) on any
 * refusal. Never throws.
 */
export function parseSongLiteralText(text: string, label: string): ResolvedSong {
  const fail = (reason: string): ResolvedSong => ({
    loadError: `Can't read ${label} as a ZzFXM song — ${reason} (found "${previewText(text)}").`,
  })

  const outer = parseNestedArrayLiteral(`[${text}]`)
  if (!outer) return fail("the source isn't a plain nested array literal")

  const tuple = destructureSongTuple(outer)
  if (!tuple) {
    return fail('expected [instruments, patterns, sequence, bpm?], a 3-4 element structure')
  }

  const [instrumentsRaw, patternsRaw, sequenceRaw, bpmRaw] = tuple
  const instruments = toInstruments(instrumentsRaw)
  if (!instruments) return fail('instruments must be an array of number arrays')
  const patterns = toPatterns(patternsRaw)
  if (!patterns) return fail('patterns must be an array of arrays of number arrays')
  const sequence = toNumberArray(sequenceRaw)
  if (!sequence) return fail('sequence must be an array of numbers')
  if (bpmRaw !== undefined && typeof bpmRaw !== 'number') return fail('bpm must be a number')

  return {
    song: {
      instruments,
      patterns,
      sequence,
      ...(typeof bpmRaw === 'number' ? { bpm: bpmRaw } : {}),
    },
  }
}
