// Resolves a finding's actual numeric params — filling in the variable
// case (`zzfx(...NAME)`) where the sidecar returns `payload.params: []`
// and instead points at the declaration's VALUE via `varRef.defUri`/
// `defRange` (confirmed against a real sidecar run: `payload.params` is
// genuinely empty for a var-ref finding, not pre-resolved). See planning/
// vscode-tools/tool-zzfx-studio.md's "Non-literal args" section.
//
// v0/single-file scope: parses a plain numeric array literal's source
// text (`[0.6, 0, 1500, ...]`) directly rather than evaluating it —
// sufficient for the preset-const shape every real caller uses (see
// e2e/fixtures/workspace/src/sounds.ts's `LASER`), not a general JS
// expression evaluator.
//
// `defRange` (#148 Z7a, tools/codelens-service/CLAUDE.md's contract) is
// the initializer VALUE range only — this module's parsing has assumed
// that shape all along, so Z7a's sidecar fix aligns reality with what
// was already written here rather than requiring a change; see the
// e2e "resolving LASER to real params" spec for the empirical proof.
// `defRange` may also be absent even when `defUri` is present (no
// initializer, e.g. `let preset;`), and the initializer need not be an
// array literal at all (`const preset = getPreset()` — the sidecar
// reports the call expression's range unvalidated). Both are handled
// below via `isNumberArrayLiteralText`, shared with `host.ts`'s save-path
// revalidation so read and write agree on exactly one definition of
// "looks like a plain number array."
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'
import { isNumberArrayLiteralText, parseNumberArrayLiteral } from './numberArrayLiteral'

// Re-exported so host.ts's existing `from './resolveParams'` import
// keeps working — the actual logic lives in numberArrayLiteral.ts (pure,
// unlike this file, so it's unit-testable without the `vscode` module).
export { isNumberArrayLiteralText } from './numberArrayLiteral'

export type ResolvedParams = {
  params: number[]
  /** Set when a variable-spread call's initializer couldn't be read as a
   * plain numeric array — e.g. `const preset = getPreset()`, or the
   * declaration's text changed to something unparseable since the
   * sidecar last scanned it. `params` falls back to
   * `finding.payload.params` (defaults, via the webview's `fromArgs`)
   * in this case; the editor surfaces `loadError` so the user knows why,
   * and MUST refuse Save while it's set — see host.ts's zzfx/save
   * handler, which independently re-validates at save time rather than
   * trusting this snapshot. */
  loadError?: string
}

function previewText(text: string, max = 40): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/**
 * Returns `finding.payload.params` directly when non-empty (the literal-
 * array call case). For a variable-spread call, reads the declaration's
 * value text from `varRef.defUri`/`defRange` and parses it. Falls back to
 * the (empty) `payload.params` on any resolution failure — a missing/
 * unparseable declaration must not crash Play/Edit, just play nothing
 * (all defaults) rather than throwing.
 */
export async function resolveParams(
  finding: Extract<Finding, { kind: 'zzfx.call' }>
): Promise<ResolvedParams> {
  if (finding.payload.params.length > 0) return { params: finding.payload.params }
  const varRef = finding.payload.varRef
  if (!varRef?.defUri || !varRef.defRange) return { params: finding.payload.params }
  try {
    const defDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(varRef.defUri))
    const range = new vscode.Range(
      varRef.defRange.start.line,
      varRef.defRange.start.character,
      varRef.defRange.end.line,
      varRef.defRange.end.character
    )
    const text = defDoc.getText(range)
    if (!isNumberArrayLiteralText(text)) {
      return {
        params: finding.payload.params,
        loadError: `Can't read "${varRef.name}"'s declaration as a plain number array (found "${previewText(text)}").`,
      }
    }
    return { params: parseNumberArrayLiteral(text) }
  } catch {
    return { params: finding.payload.params }
  }
}
