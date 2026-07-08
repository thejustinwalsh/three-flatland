// The `vscode`-dependent half of `wad.synth` resolution — mirrors
// resolveSong.ts's exact shape: read the source text a `wad.synth`
// finding needs (the declaration's value for a bare-identifier var-ref
// call, the call's own argument-list text otherwise) and hand it to
// `wadSynthResolver.ts`'s pure `parseWadSynthLiteralText`. e2e-covered
// only, not unit-tested directly, same posture as `resolveSong`/
// `resolveParams` themselves.
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'
import { parseWadSynthLiteralText, type ResolvedWadSynth } from './wadSynthResolver'

export type WadSynthFinding = Extract<Finding, { kind: 'wad.synth' }>

function rangeFromWire(range: Finding['range']): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

/**
 * Reads the source text for `finding` (the declaration's value for a
 * bare-identifier var-ref call — the scanner's "always emit, defer
 * validation" posture for `new Wad(identifier)` — or the call's own
 * argument-list text for a direct object literal) and parses it. `uri` is
 * the finding's OWN document, needed here (unlike `resolveParams`)
 * because a `wad.synth` finding never carries pre-extracted config; there
 * is always real text to go read.
 */
export async function resolveWadSynth(
  uri: vscode.Uri,
  finding: WadSynthFinding
): Promise<ResolvedWadSynth> {
  const varRef = finding.payload.varRef
  if (varRef) {
    if (!varRef.defUri || !varRef.defRange) {
      return {
        loadError: `Can't read "${varRef.name}" — its declaration wasn't found (it may have no initializer).`,
      }
    }
    try {
      const defDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(varRef.defUri))
      const text = defDoc.getText(rangeFromWire(varRef.defRange))
      return parseWadSynthLiteralText(text, `"${varRef.name}"`)
    } catch {
      return {
        loadError: `Can't read "${varRef.name}"'s declaration — the source may have changed.`,
      }
    }
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri)
    const text = doc.getText(rangeFromWire(finding.payload.argRange))
    return parseWadSynthLiteralText(text, 'this Wad() call')
  } catch {
    return { loadError: "Can't read this Wad() call — the source may have changed." }
  }
}
