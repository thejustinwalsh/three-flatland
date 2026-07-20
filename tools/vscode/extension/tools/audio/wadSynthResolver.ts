// Pure text-shape parsing for a `wad.synth` finding's Wad synthesis config
// object — mirrors songResolver.ts's split from numberArrayLiteral.ts: no
// `vscode` import at module scope, so this file is unit-testable under
// plain vitest.
//
// `wad.synth`'s payload has no pre-extracted config (tools/codelens-service/
// AGENTS.md) — like zzfxm.song, there's always real source text to read and
// parse, whether the call site is a literal object
// (`new Wad({source:'square'})`, read at `argRange`) or a bare-identifier
// var-ref (`new Wad(cfg)`, read at `varRef.defRange`).
//
// The scanner (sidecar/src/parse.rs::extract_wad_synth) is deliberately
// PERMISSIVE for the var-ref case — it always emits a finding with varRef
// set for a bare-identifier argument, without checking whether the resolved
// declaration actually IS an oscillator config — so this parser is the one
// place that decision actually gets made; refuse gracefully (loadError)
// rather than guess, the same "permissive scanner / validating client"
// division of labor resolveParams.ts documents for zzfx.

export type WadOscillatorSource = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'

const OSCILLATOR_SOURCES: readonly WadOscillatorSource[] = ['sine', 'square', 'sawtooth', 'triangle', 'noise']

function isOscillatorSource(value: string): value is WadOscillatorSource {
  return (OSCILLATOR_SOURCES as readonly string[]).includes(value)
}

/**
 * Wad's synthesis-mode config. Only `source` is required to resolve
 * correctly; every other field is a simple literal (number/string/boolean)
 * parsed opportunistically as a bonus — never validated against Wad's full
 * documented API surface (env/filter/vibrato/pitch/volume/etc.), and never
 * required for a successful resolve.
 */
export type WadSynthConfig = {
  source: WadOscillatorSource
} & Record<string, number | string | boolean>

export type ResolvedWadSynth = { config: WadSynthConfig } | { loadError: string }

function previewText(text: string, max = 40): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

const STRING_LITERAL = /^"(?:[^"\\]|\\.)*"$|^'(?:[^'\\]|\\.)*'$/
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Splits an object literal's INTERIOR into top-level `key: value` pair
 * texts, tracking `{}`/`[]` depth and quoted-string spans so a nested
 * structure's inner commas (or a comma inside a string literal) don't
 * fragment the split. Mirrors numberArrayLiteral.ts's
 * `splitTopLevelElements`, generalized to `{}` as well as `[]` since object
 * literals nest both.
 */
function splitTopLevelPairs(inner: string): string[] | null {
  if (inner.trim() === '') return []

  const parts: string[] = []
  let depth = 0
  let quote: '"' | "'" | null = null
  let escapeNext = false
  let current = ''

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (quote) {
      current += ch
      // Forward escape-state tracking, not a one-character lookback — see
      // numberArrayLiteral.ts's `splitTopLevelElements` for why a lookback
      // alone can't tell an escaped backslash (`'a\\'`) apart from an
      // escaped quote.
      if (escapeNext) {
        escapeNext = false
      } else if (ch === '\\') {
        escapeNext = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '{' || ch === '[') {
      depth++
      current += ch
      continue
    }
    if (ch === '}' || ch === ']') {
      depth--
      if (depth < 0) return null // unbalanced — a stray closer at this level
      current += ch
      continue
    }
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (quote !== null || depth !== 0) return null // unterminated string or unbalanced brackets
  parts.push(current)

  if ((parts[parts.length - 1] ?? '').trim() === '') parts.pop()
  if (parts.some((part) => part.trim() === '')) return null
  return parts.map((part) => part.trim())
}

/**
 * Splits one `key: value` pair text at its top-level `:` (depth/quote
 * aware, same reasoning as `splitTopLevelPairs`) — a value can itself
 * contain `:` inside a nested object/string. `null` if there's no top-level
 * `:` at all (a malformed pair).
 */
function splitKeyValue(pair: string): [string, string] | null {
  let depth = 0
  let quote: '"' | "'" | null = null
  let escapeNext = false
  for (let i = 0; i < pair.length; i++) {
    const ch = pair[i]!
    if (quote) {
      // Forward escape-state tracking — see splitTopLevelPairs above.
      if (escapeNext) {
        escapeNext = false
      } else if (ch === '\\') {
        escapeNext = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{' || ch === '[') {
      depth++
      continue
    }
    if (ch === '}' || ch === ']') {
      depth--
      continue
    }
    if (ch === ':' && depth === 0) {
      return [pair.slice(0, i).trim(), pair.slice(i + 1).trim()]
    }
  }
  return null
}

function parseKey(text: string): string | null {
  if (IDENTIFIER_KEY.test(text)) return text
  if (STRING_LITERAL.test(text)) return text.slice(1, -1)
  return null
}

/** Parses a simple literal value: string/number/boolean. `undefined` for
 * anything else (a nested object/array, an identifier, a call expression,
 * ...) — those fields are skipped rather than refusing the whole config,
 * since only `source` is required. */
function parseLiteralValue(text: string): number | string | boolean | undefined {
  if (text === 'true') return true
  if (text === 'false') return false
  if (STRING_LITERAL.test(text)) return text.slice(1, -1)
  if (text.trim() === '') return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Pure: parses `text` (the raw source text at either `argRange` or
 * `varRef.defRange`, see the file doc comment for which) into a
 * `WadSynthConfig`, or a `loadError` naming `label` on any refusal. Never
 * throws. Only `source` is required to resolve correctly — one of the five
 * oscillator/noise keywords — everything else is bonus, best-effort.
 */
export function parseWadSynthLiteralText(text: string, label: string): ResolvedWadSynth {
  const fail = (reason: string): ResolvedWadSynth => ({
    loadError: `Can't read ${label} as a Wad synthesis config — ${reason} (found "${previewText(text)}").`,
  })

  const trimmed = text.trim()
  if (!/^\{[\s\S]*\}$/.test(trimmed)) {
    return fail("the source isn't a plain object literal")
  }

  const inner = trimmed.slice(1, -1)
  const pairs = splitTopLevelPairs(inner)
  if (pairs === null) return fail('the object literal is malformed')

  const config: Record<string, number | string | boolean> = {}
  for (const pairText of pairs) {
    const split = splitKeyValue(pairText)
    if (!split) continue
    const [keyText, valueText] = split
    const key = parseKey(keyText)
    if (!key) continue
    const value = parseLiteralValue(valueText)
    if (value === undefined) continue
    config[key] = value
  }

  const source = config.source
  if (typeof source !== 'string' || !isOscillatorSource(source)) {
    return fail("source must be one of 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'")
  }

  return { config: { ...config, source } }
}
