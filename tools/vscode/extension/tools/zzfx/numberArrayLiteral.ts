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
