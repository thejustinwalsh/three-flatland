// Inline `▶ Play` / `⚙ Edit` CodeLens above every `zzfx(...)` call — see
// planning/vscode-tools/tool-zzfx-studio.md's "CodeLens provider" section.
// `provideCodeLenses` returns range-only lenses (fast — VS Code calls this
// on every keystroke-adjacent scroll/edit); `resolveCodeLens` computes the
// title + command lazily, only for lenses actually scrolled into view.
import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { log } from '../../log'
import { resolveParams } from './resolveParams'

/** Tier 1 glob equivalent as a VS Code language selector — the sidecar
 * scans `**\/*.{ts,tsx,js,jsx,mjs,cjs}`; .mjs/.cjs both register under the
 * `javascript` language id in VS Code, so 4 ids cover all 6 extensions. */
export const ZZFX_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  { language: 'typescript' },
  { language: 'typescriptreact' },
  { language: 'javascript' },
  { language: 'javascriptreact' },
]

const DIDCHANGE_DEBOUNCE_MS = 350
const REFRESH_DEBOUNCE_MS = 250

function toVscodeRange(range: Finding['range']): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

/** Carries the finding + which of the two lenses this is — resolveCodeLens
 * reads these back off the instance VS Code hands it. */
type ZzfxCallFinding = Extract<Finding, { kind: 'zzfx.call' }>

class ZzfxCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly finding: ZzfxCallFinding,
    readonly variant: 'play' | 'edit',
    readonly docUri: vscode.Uri
  ) {
    super(range)
  }
}

export class ZzfxCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  private readonly notifyTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly getClient: () => Promise<CodelensServiceClient | null>) {}

  dispose(): void {
    this._onDidChangeCodeLenses.dispose()
    for (const timer of this.notifyTimers.values()) clearTimeout(timer)
    for (const timer of this.refreshTimers.values()) clearTimeout(timer)
    this.notifyTimers.clear()
    this.refreshTimers.clear()
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const client = await this.getClient()
    if (!client) return []

    let findings: Finding[]
    try {
      const result = await client.parse({ uri: document.uri.toString(), text: document.getText() })
      findings = result.findings
    } catch (err) {
      log(
        `zzfx CodeLens: parse failed for ${document.uri.toString()}: ${err instanceof Error ? err.message : err}`
      )
      return []
    }

    const lenses: vscode.CodeLens[] = []
    for (const finding of findings) {
      // A1 added zzfxm.song / audio.file kinds; lenses for them arrive with
      // A3 — until then only zzfx.call findings surface in the editor.
      if (finding.kind !== 'zzfx.call') continue
      const range = toVscodeRange(finding.range)
      lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri))
      lenses.push(new ZzfxCodeLens(range, finding, 'edit', document.uri))
    }
    return lenses
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    if (!(codeLens instanceof ZzfxCodeLens)) return codeLens

    if (codeLens.variant === 'play') {
      // For a variable-spread call (`zzfx(...NAME)`), the sidecar's
      // `payload.params` is genuinely empty — the resolved values live
      // only in the declaration's source text via `varRef`. Resolve
      // before binding the command's argument so Play actually plays
      // NAME's sound, not silence.
      const { params } = await resolveParams(codeLens.finding)
      // First argument is the plain params array (planning doc: "args:
      // params array") — the second, additive argument carries this
      // finding's real identity so register.ts can open/reuse its actual
      // editor panel to play through, rather than needing a synthetic
      // panel. Optional in the command's own signature; only this
      // provider ever supplies it.
      codeLens.command = {
        title: '▶ Play',
        command: 'threeFlatland.zzfx.playParams',
        arguments: [params, { uri: codeLens.docUri.toString(), findingId: codeLens.finding.id }],
      }
    } else {
      const isVar = Boolean(codeLens.finding.payload.varRef)
      codeLens.command = {
        title: isVar ? '⚙ Edit (variable)' : '⚙ Edit',
        command: 'threeFlatland.zzfx.openEditor',
        arguments: [{ uri: codeLens.docUri.toString(), findingId: codeLens.finding.id }],
      }
    }
    return codeLens
  }

  /**
   * Tier 3 (incremental on change) — two independent, separately-debounced
   * signals per the planning doc's scanner strategy, not one shared timer:
   *
   * 1. Notify the sidecar of the live edit (350ms), a perf hint for its
   *    own incremental reparse cache. This provider's correctness never
   *    depends on it — `provideCodeLenses` always re-parses the full
   *    current text itself.
   * 2. Fire `onDidChangeCodeLenses` (250ms), which makes VS Code re-invoke
   *    `provideCodeLenses` — that fresh, synchronous `client.parse()` call
   *    IS the "parse completion" this refresh represents; `didChange`
   *    itself is a fire-and-forget notification with no response to key
   *    completion off.
   *
   * Both debounced independently per-document so a burst of keystrokes
   * produces one of each, not one per keystroke.
   */
  scheduleRefresh(client: CodelensServiceClient, document: vscode.TextDocument): void {
    const key = document.uri.toString()

    const existingNotify = this.notifyTimers.get(key)
    if (existingNotify) clearTimeout(existingNotify)
    this.notifyTimers.set(
      key,
      setTimeout(() => {
        this.notifyTimers.delete(key)
        try {
          client.didChange({ uri: key, text: document.getText() })
        } catch (err) {
          log(`zzfx CodeLens: didChange notify failed: ${err instanceof Error ? err.message : err}`)
        }
      }, DIDCHANGE_DEBOUNCE_MS)
    )

    const existingRefresh = this.refreshTimers.get(key)
    if (existingRefresh) clearTimeout(existingRefresh)
    this.refreshTimers.set(
      key,
      setTimeout(() => {
        this.refreshTimers.delete(key)
        this._onDidChangeCodeLenses.fire()
      }, REFRESH_DEBOUNCE_MS)
    )
  }
}
