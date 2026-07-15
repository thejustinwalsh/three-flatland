// Shared by every zzfx host-side file that converts a Finding's wire-protocol
// range (line/character pairs) into a vscode.Range — was independently
// copy-pasted five times (host.ts, provider.ts, resolveSong.ts,
// resolveToneSynth.ts, resolveWadSynth.ts) before being consolidated here.
import * as vscode from 'vscode'
import type { Finding } from '@three-flatland/codelens-service'

export function rangeFromWire(range: Finding['range']): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}
