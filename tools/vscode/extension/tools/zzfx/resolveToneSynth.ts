// The `vscode`-dependent half of `tone.synth` resolution — mirrors
// resolveSong.ts/resolveWadSynth.ts's shape, simplified: `tone.synth` has
// no `varRef` at all (the scanner refuses the WHOLE finding for a
// non-static note/duration/chord, so by the time a finding exists,
// `argRange`'s text is guaranteed to be `triggerAttackRelease`'s own
// static argument list — see toneSynthResolver.ts's file doc comment).
// `synthType`/`voiceType` are read straight off the finding's payload —
// already classified sidecar-side — and passed through unchanged.
// e2e-covered only, not unit-tested directly, same posture as
// `resolveSong`/`resolveWadSynth`.
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'
import { parseToneSynthArgsText, type ResolvedToneSynth } from './toneSynthResolver'

export type ToneSynthFinding = Extract<Finding, { kind: 'tone.synth' }>

function rangeFromWire(range: Finding['range']): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

/**
 * Reads the source text at `finding.payload.argRange` (the
 * `triggerAttackRelease(...)` call's own argument-list text) and parses
 * it into playback-ready note/duration values.
 */
export async function resolveToneSynth(
  uri: vscode.Uri,
  finding: ToneSynthFinding
): Promise<ResolvedToneSynth> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri)
    const text = doc.getText(rangeFromWire(finding.payload.argRange))
    return parseToneSynthArgsText(
      text,
      finding.payload.synthType,
      finding.payload.voiceType,
      'this Tone.js call'
    )
  } catch {
    return { loadError: "Can't read this Tone.js call — the source may have changed." }
  }
}
