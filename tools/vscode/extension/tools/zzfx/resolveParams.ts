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
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'

function parseNumberArrayLiteral(text: string): number[] {
  const trimmed = text.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (trimmed === '') return []
  return trimmed
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

/**
 * Returns `finding.payload.params` directly when non-empty (the literal-
 * array call case). For a variable-spread call, reads the declaration's
 * value text from `varRef.defUri`/`defRange` and parses it. Falls back to
 * the (empty) `payload.params` on any resolution failure — a missing/
 * unparseable declaration must not crash Play/Edit, just play nothing
 * (all defaults) rather than throwing.
 */
export async function resolveParams(finding: Finding): Promise<number[]> {
  if (finding.payload.params.length > 0) return finding.payload.params
  const varRef = finding.payload.varRef
  if (!varRef?.defUri || !varRef.defRange) return finding.payload.params
  try {
    const defDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(varRef.defUri))
    const range = new vscode.Range(
      varRef.defRange.start.line,
      varRef.defRange.start.character,
      varRef.defRange.end.line,
      varRef.defRange.end.character
    )
    return parseNumberArrayLiteral(defDoc.getText(range))
  } catch {
    return finding.payload.params
  }
}
