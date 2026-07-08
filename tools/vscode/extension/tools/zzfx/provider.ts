// Inline `▶ Play` / `⚙ Edit` / `⏹ Stop` CodeLens above every zzfx.call,
// zzfxm.song, and audio.file finding — see
// planning/vscode-tools/tool-zzfx-studio.md's "CodeLens provider" section.
// `provideCodeLenses` returns range-only lenses (fast — VS Code calls this
// on every keystroke-adjacent scroll/edit); `resolveCodeLens` computes the
// title + command lazily, only for lenses actually scrolled into view.
//
// `audio.file` is the one kind whose LENS EXISTENCE (not just its command)
// depends on work done in `provideCodeLenses` — an unresolvable path means
// no lens at all, which can't be deferred to `resolveCodeLens` (that only
// fills in an already-emitted lens's command). See `audioFileResolver.ts`.
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { log } from '../../log'
import { resolveParams } from './resolveParams'
import { resolveAudioFilePath } from './audioFileResolver'

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

/** Carries the finding + which lens variant this is — resolveCodeLens reads
 * these back off the instance VS Code hands it. `variant` spans all three
 * kinds: zzfx.call gets play/edit, zzfxm.song gets play/stop, audio.file
 * gets play only. */
type LensVariant = 'play' | 'edit' | 'stop'

class ZzfxCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly finding: Finding,
    readonly variant: LensVariant,
    readonly docUri: vscode.Uri,
    /** `audio.file` only — the path resolved (and existence-checked) once
     * in `provideCodeLenses`, so `resolveCodeLens` never re-touches the
     * filesystem. */
    readonly resolvedPath?: string
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
    const sourceDir = path.dirname(document.uri.fsPath)
    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? sourceDir

    for (const finding of findings) {
      const range = toVscodeRange(finding.range)
      switch (finding.kind) {
        case 'zzfx.call':
          lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri))
          lenses.push(new ZzfxCodeLens(range, finding, 'edit', document.uri))
          break
        case 'zzfxm.song':
          lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri))
          lenses.push(new ZzfxCodeLens(range, finding, 'stop', document.uri))
          break
        case 'audio.file': {
          // Existence-gated: an audio.file lens must be ABSENT when the
          // referenced path doesn't resolve to a real file — there's
          // nothing playable to offer, and resolveCodeLens can't retract
          // an already-emitted lens.
          const resolved = resolveAudioFilePath(finding.payload.path, sourceDir, workspaceRoot)
          if (!resolved) break
          lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri, resolved))
          break
        }
      }
    }
    return lenses
  }

  async resolveCodeLens(
    codeLens: vscode.CodeLens,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    if (!(codeLens instanceof ZzfxCodeLens)) return codeLens

    const { finding, variant, docUri } = codeLens
    const source = { uri: docUri.toString(), findingId: finding.id }

    if (finding.kind === 'zzfx.call') {
      if (variant === 'play') {
        // For a variable-spread call (`zzfx(...NAME)`), the sidecar's
        // `payload.params` is genuinely empty — the resolved values live
        // only in the declaration's source text via `varRef`. Resolve
        // before binding the command's argument so Play actually plays
        // NAME's sound, not silence.
        const { params } = await resolveParams(finding)
        // First argument is the plain params array (planning doc: "args:
        // params array") — the second, additive argument carries this
        // finding's real identity so register.ts can open/reuse its actual
        // editor panel to play through, rather than needing a synthetic
        // panel. Optional in the command's own signature; only this
        // provider ever supplies it.
        codeLens.command = {
          title: '▶ Play',
          command: 'threeFlatland.zzfx.playParams',
          arguments: [params, source],
        }
      } else {
        const isVar = Boolean(finding.payload.varRef)
        codeLens.command = {
          title: isVar ? '⚙ Edit (variable)' : '⚙ Edit',
          command: 'threeFlatland.zzfx.openEditor',
          arguments: [source],
        }
      }
    } else if (finding.kind === 'zzfxm.song') {
      // Resolution of the actual Song data (the harder, potentially
      // async/error-prone part) is deferred to the command handler in
      // register.ts — this only needs the finding's identity, mirroring
      // playParams'/openEditor's `{uri, findingId}` re-parse-fresh pattern.
      codeLens.command =
        variant === 'play'
          ? { title: '▶ Play', command: 'threeFlatland.zzfx.playSong', arguments: [source] }
          : { title: '⏹ Stop', command: 'threeFlatland.zzfx.stopSong', arguments: [] }
    } else {
      // audio.file — resolvedPath was already existence-checked in
      // provideCodeLenses; this lens wouldn't exist otherwise.
      codeLens.command = {
        title: '▶ Play',
        command: 'threeFlatland.zzfx.playFile',
        arguments: [codeLens.resolvedPath],
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
