// Pure text-shape parsing for `resolveParams.ts` (the read path) and
// `host.ts`'s zzfx/save handler (the write-path revalidation) — split
// out so it's unit-testable without the `vscode` module both of those
// files import at module scope.

/**
 * Splits a bracket-wrapped, comma-separated list into its element texts.
 * A single trailing comma before `]` (`[0.6, 0, 1500,]` — valid JS, and
 * this repo's own Prettier trailing-comma style) is formatting and gets
 * stripped, not treated as an empty element. Any OTHER empty segment —
 * sparse (`[1,,220]`), leading (`[,1,2]`), or a second trailing comma
 * (`[1,2,,]`) — means the text isn't a plain array, so this returns
 * `null` rather than silently coercing the gap to `0`. Returns `null`
 * (not `[]`) for non-bracket-wrapped text too. Shared by
 * `isNumberArrayLiteralText` and `parseNumberArrayLiteral` so read and
 * write agree on exactly one definition of "looks like a plain number
 * array" — and on exactly one definition of "trailing comma," so a
 * value can never silently gain or lose an element between load and Save.
 */
export function tokenizeNumberArrayLiteral(text: string): string[] | null {
  const trimmed = text.trim()
  if (!/^\[[\s\S]*\]$/.test(trimmed)) return null
  const inner = trimmed.slice(1, -1).trim()
  if (inner === '') return []
  const parts = inner.split(',')
  // `inner.split(',')` on a non-empty string always yields >= 1 element,
  // but noUncheckedIndexedAccess can't prove that — the `?? ''` is dead
  // in practice, not a fallback for a real empty-array case.
  if ((parts[parts.length - 1] ?? '').trim() === '') parts.pop()
  if (parts.some((part) => part.trim() === '')) return null
  return parts.map((part) => part.trim())
}

/** Whether `text` (already trimmed) is shaped like `[n, n, ...]` — no
 * nested expressions, no function calls, just a bracket-wrapped,
 * comma-separated list (one optional trailing comma). Deliberately
 * conservative: the sidecar reports `defRange` for WHATEVER initializer
 * is there without validating its shape (tools/codelens-service/CLAUDE.md),
 * so this is the one place both the read path (resolveParams) and the
 * write path (host.ts's zzfx/save) agree on what's safe to treat as "a
 * preset array." */
export function isNumberArrayLiteralText(text: string): boolean {
  const tokens = tokenizeNumberArrayLiteral(text)
  if (tokens === null) return false
  return tokens.every((token) => Number.isFinite(Number(token)))
}

export function parseNumberArrayLiteral(text: string): number[] {
  const tokens = tokenizeNumberArrayLiteral(text)
  if (tokens === null) return []
  return tokens.map(Number).filter((n) => Number.isFinite(n))
}

/**
 * A generalization of the lineage above for `songResolver.ts`'s ZzFXM
 * parsing — a ZzFXM song is a deeply nested array of arrays (patterns of
 * channels of notes), not a flat numeric list, so `tokenizeNumberArrayLiteral`'s
 * single `.split(',')` isn't enough: a nested literal's inner commas
 * (`[[1,2],[3,4]]`) must not fragment the top-level split. Leaves may be
 * `number | null | string` — refuses anything else (an identifier, a call
 * expression, an object, a spread element, ...) by returning `null` for
 * the WHOLE literal, same "refuse, don't coerce" posture as
 * `isNumberArrayLiteralText`. Kept as a separate function rather than
 * rewriting the flat parser in terms of this one — the flat parser's
 * trailing-comma/sparse-element behavior is pinned by its own regression
 * tests and used by the write path (`host.ts`'s zzfx/save); no reason to
 * risk drifting it.
 */
export type NestedArrayLeaf = number | null | string
export type NestedArrayValue = NestedArrayLeaf | NestedArrayValue[]

/** Splits a bracket literal's INTERIOR into top-level element texts,
 * tracking `[`/`]` depth and quoted-string spans so neither a nested
 * array's inner commas nor a comma inside a string literal fragments the
 * split. Trailing-comma/sparse-element rules mirror
 * `tokenizeNumberArrayLiteral` exactly, applied at this one level (each
 * recursive call re-applies them one level deeper). */
function splitTopLevelElements(inner: string): string[] | null {
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
      // Forward escape-state tracking, not a one-character lookback — a
      // string ending in an ESCAPED backslash (`'a\\'`, i.e. `\`, `\`, `'`)
      // must close on that final quote, since the two backslashes form one
      // escaped-backslash pair, not an escape-the-quote marker. A lookback
      // at `inner[i-1]` alone can't tell an escaped backslash apart from an
      // escaped quote — only walking the run forward can.
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
    if (ch === '[') {
      depth++
      current += ch
      continue
    }
    if (ch === ']') {
      depth--
      if (depth < 0) return null // unbalanced — a stray ']' at this level
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

const STRING_LITERAL = /^"(?:[^"\\]|\\.)*"$|^'(?:[^'\\]|\\.)*'$/

function parseNestedLeafOrArray(token: string): NestedArrayValue | undefined {
  if (token === 'null') return null
  if (/^\[[\s\S]*\]$/.test(token)) {
    const nested = parseNestedArrayLiteral(token)
    return nested ?? undefined
  }
  if (STRING_LITERAL.test(token)) return token.slice(1, -1)
  if (token === '') return undefined
  const n = Number(token)
  return Number.isFinite(n) ? n : undefined
}

export function parseNestedArrayLiteral(text: string): NestedArrayValue[] | null {
  const trimmed = text.trim()
  if (!/^\[[\s\S]*\]$/.test(trimmed)) return null
  const inner = trimmed.slice(1, -1)
  const tokens = splitTopLevelElements(inner)
  if (tokens === null) return null

  const values: NestedArrayValue[] = []
  for (const token of tokens) {
    const value = parseNestedLeafOrArray(token)
    if (value === undefined) return null
    values.push(value)
  }
  return values
}
