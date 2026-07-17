// The `vscode`-dependent half of `tone.synth` resolution — mirrors
// resolveSong.ts/resolveWadSynth.ts's shape. `duration`/`time`/`velocity`
// stay fully-static-or-nothing (the scanner refuses the whole finding for
// a non-literal there), but the note/chord argument (position 0) can
// carry a `varRef` — same permissive posture `wad.synth` already has for
// its whole config argument. `synthType`/`voiceType` are read straight
// off the finding's payload — already classified sidecar-side — and
// passed through unchanged. e2e-covered only, not unit-tested directly,
// same posture as `resolveSong`/`resolveWadSynth`.
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'
import { parseToneSynthArgsText, type ResolvedToneSynth } from './toneSynthResolver'
import { rangeFromWire } from './wireRange'

export type ToneSynthFinding = Extract<Finding, { kind: 'tone.synth' }>

/**
 * Reads the source text at `finding.payload.argRange` (the
 * `triggerAttackRelease(...)` call's own argument-list text) and parses
 * it into playback-ready note/duration values. When `varRef` is set, the
 * note/chord argument's text there is just the bare identifier's NAME
 * (not a literal) — this reads the identifier's own declaration text at
 * `varRef.defRange` and splices it in ahead of parsing. The identifier is
 * always argRange's very first token (the sidecar's own `arg_range`
 * always starts exactly at argument 0 — same contract `argument_interior_
 * range` guarantees for zzfx/wad.synth), so a straight `slice(name.
 * length)` on the remainder is exact, not a heuristic search.
 */
export async function resolveToneSynth(uri: vscode.Uri, finding: ToneSynthFinding): Promise<ResolvedToneSynth> {
  const varRef = finding.payload.varRef
  try {
    const doc = await vscode.workspace.openTextDocument(uri)
    let text = doc.getText(rangeFromWire(finding.payload.argRange))
    if (varRef) {
      if (!varRef.defUri || !varRef.defRange) {
        return {
          loadError: `Can't read "${varRef.name}" — its declaration wasn't found (it may have no initializer).`,
        }
      }
      const defDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(varRef.defUri))
      const noteText = defDoc.getText(rangeFromWire(varRef.defRange))
      text = noteText + text.slice(varRef.name.length)
    }
    return parseToneSynthArgsText(text, finding.payload.synthType, finding.payload.voiceType, 'this Tone.js call')
  } catch {
    return { loadError: "Can't read this Tone.js call — the source may have changed." }
  }
}
