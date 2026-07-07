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
class ZzfxCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly finding: Finding,
    readonly variant: 'play' | 'edit',
    readonly docUri: vscode.Uri
  ) {
    super(range)
  }
}

export class ZzfxCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private readonly getClient: () => Promise<CodelensServiceClient | null>) {}

  dispose(): void {
    this._onDidChangeCodeLenses.dispose()
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
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
      const params = await resolveParams(codeLens.finding)
      codeLens.command = {
        title: '▶ Play',
        command: 'threeFlatland.zzfx.playParams',
        arguments: [params],
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
   * Tier 3 (incremental on change): notifies the sidecar of the live edit
   * (a perf hint for its own incremental reparse — this provider's
   * correctness never depends on that path; `provideCodeLenses` always
   * re-parses the full current text), then fires `onDidChangeCodeLenses`
   * once edits settle. Debounced per-document so a burst of keystrokes
   * produces one refresh, not one per keystroke.
   */
  scheduleRefresh(client: CodelensServiceClient, document: vscode.TextDocument): void {
    const key = document.uri.toString()
    try {
      client.didChange({ uri: key, text: document.getText() })
    } catch (err) {
      log(`zzfx CodeLens: didChange notify failed: ${err instanceof Error ? err.message : err}`)
    }

    const existing = this.debounceTimers.get(key)
    if (existing) clearTimeout(existing)
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key)
        this._onDidChangeCodeLenses.fire()
      }, REFRESH_DEBOUNCE_MS)
    )
  }
}
