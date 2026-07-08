// The `vscode`-dependent half of ZzFXM song resolution — reads the source
// text a `zzfxm.song` finding needs (the declaration's value for a var-ref
// call, the call's own argument-list text otherwise) and hands it to
// `songResolver.ts`'s pure `parseSongLiteralText`. Split out (rather than
// living in songResolver.ts) so the parser stays unit-testable under plain
// vitest — same split `resolveParams.ts` takes from `numberArrayLiteral.ts`.
// e2e-covered only, not unit-tested directly, same posture as
// `resolveParams` itself.
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'
import { parseSongLiteralText, type ResolvedSong } from './songResolver'
import { rangeFromWire } from './wireRange'

export type ZzfxmSongFinding = Extract<Finding, { kind: 'zzfxm.song' }>

/**
 * Reads the source text for `finding` (the declaration's value for a
 * var-ref call, the call's own argument-list text otherwise) and parses
 * it. `uri` is the finding's OWN document — needed here (unlike
 * `resolveParams`) because a `zzfxm.song` finding never carries pre-
 * extracted values; there is always real text to go read.
 */
export async function resolveSong(
  uri: vscode.Uri,
  finding: ZzfxmSongFinding
): Promise<ResolvedSong> {
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
      return parseSongLiteralText(text, `"${varRef.name}"`)
    } catch {
      return {
        loadError: `Can't read "${varRef.name}"'s declaration — the source may have changed.`,
      }
    }
  }
  try {
    const doc = await vscode.workspace.openTextDocument(uri)
    const text = doc.getText(rangeFromWire(finding.payload.argRange))
    return parseSongLiteralText(text, 'this zzfxm() call')
  } catch {
    return { loadError: "Can't read this zzfxm() call — the source may have changed." }
  }
}
