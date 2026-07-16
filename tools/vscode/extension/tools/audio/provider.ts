// Inline CodeLens above every zzfx.call (`▶ Play` + `⚙ Edit`),
// zzfxm.song, audio.file, wad.synth, and tone.synth finding — see
// planning/vscode-tools/tool-zzfx-studio.md's "CodeLens provider" section.
//
// STATIC two-lens pair (`▶ Play` + `⏹ Stop`, both always present, neither
// conditioned on playback state) for every kind except zzfx.call — a
// deliberate reversal of #46's single toggling lens, per stakeholder
// directive: the toggle's lens-refresh round trip (wait for
// onDidChangeCodeLenses → VS Code re-invokes provideCodeLenses/
// resolveCodeLens → async recompute of which face to show) made
// rapid-fire re-clicking Play impossible, since after one click the lens
// became Stop and you had to wait for it to settle back. Static lenses
// eliminate that structurally: Play's command/title never changes, so N
// rapid clicks just send N play commands with zero refresh-wait between
// them — the same way zzfx.call's Play already worked. `ActivePlayback`
// still exists (register.ts) for the source-editor-tab-binding feature
// (stop the sound when its source document loses focus/closes), it just
// no longer drives lens rendering here.
// `provideCodeLenses` returns range-only lenses (fast — VS Code calls this
// on every keystroke-adjacent scroll/edit); `resolveCodeLens` computes the
// title + command lazily, only for lenses actually scrolled into view.
//
// `audio.file` is the one kind whose LENS SHAPE (not just its command)
// depends on work done in `provideCodeLenses` — the fast/slow resolution
// state decides between `▶ Play`, a `$(search)  Searching…` resolving lens, a
// `$(search)  Not Found` lens, and (for URLs/absolute paths the workspace
// search can't meaningfully hunt for) no lens at all, which can't be
// deferred to `resolveCodeLens` (that only fills in an already-emitted
// lens's command). See `audioFileResolver.ts` for the whole fast→slow →
// per-session cache → lazy-repair design.
import * as path from 'node:path'
import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { log } from '../../log'
import { resolveParams } from './resolveParams'
import { rangeFromWire } from './wireRange'
import type { AudioFileLensState, AudioFileResolver } from './audioFileResolver'
import { INLINE_PLAYBACK_SETTING } from './settings'

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

/** Carries the finding + which lens variant this is — resolveCodeLens reads
 * these back off the instance VS Code hands it. zzfx.call gets play/edit;
 * every other playable kind gets a static play/stop PAIR (both always
 * present, neither conditioned on playback state) — UNLESS its varRef is
 * provably unresolvable (see 'unresolved' below), in which case it gets a
 * single inert lens instead of the pair. */
type LensVariant = 'play' | 'edit' | 'stop' | 'unresolved'

/** `audio.file` only — everything `resolveCodeLens` needs to bake the
 * lens's command without re-touching the filesystem: the resolution
 * state computed once in `provideCodeLenses`, plus the reference triple
 * the playFile command hands back to the resolver for its play-time
 * verify/repair. */
type AudioFileLensInfo = {
  resolution: AudioFileLensState
  ref: { path: string; sourceDir: string; workspaceRoot: string }
}

class ZzfxCodeLens extends vscode.CodeLens {
  constructor(
    range: vscode.Range,
    readonly finding: Finding,
    readonly variant: LensVariant,
    readonly docUri: vscode.Uri,
    readonly audioFile?: AudioFileLensInfo
  ) {
    super(range)
  }
}

export class ZzfxCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event

  private readonly notifyTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly getClient: () => Promise<CodelensServiceClient | null>,
    private readonly audioResolver: AudioFileResolver
  ) {}

  dispose(): void {
    this._onDidChangeCodeLenses.dispose()
    for (const timer of this.notifyTimers.values()) clearTimeout(timer)
    for (const timer of this.refreshTimers.values()) clearTimeout(timer)
    this.notifyTimers.clear()
    this.refreshTimers.clear()
  }

  /** Re-render every lens now — the audio resolver fires this when an
   * async search settles or a play-time repair changes an answer. */
  refresh(): void {
    this._onDidChangeCodeLenses.fire()
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
    // Inline playback off means "no playback, full stop" — every Play/Stop
    // lens (every kind but zzfx.call's Edit, which doesn't play anything)
    // disappears rather than showing an affordance that can't work. zzfx
    // is the one kind with a real panel-based fallback, but keeping its
    // Play lens around while nothing else plays is exactly the
    // inconsistent, hard-to-explain state this setting is meant to avoid —
    // see register.ts's onDidChangeConfiguration, which refreshes every
    // open document's lenses live when this flips.
    const inlineEnabled = vscode.workspace
      .getConfiguration()
      .get<boolean>(INLINE_PLAYBACK_SETTING, true)

    for (const finding of findings) {
      const range = rangeFromWire(finding.range)
      switch (finding.kind) {
        case 'zzfx.call':
          if (inlineEnabled) lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri))
          lenses.push(new ZzfxCodeLens(range, finding, 'edit', document.uri))
          break
        case 'zzfxm.song':
        case 'wad.synth':
        case 'tone.synth': {
          if (!inlineEnabled) break
          // A static Play+Stop pair, both always present — see the file
          // doc comment for why this reverses #46's single toggling
          // lens. Always emitted immediately, unlike audio.file's
          // fast/slow resolution states — a wad.synth var-ref that
          // resolves to a real declaration but an INVALID oscillator
          // config, or any other content-level resolver refusal, still
          // surfaces as an error message at Play-click time (register.ts),
          // not as a conditional lens here — that check needs to open and
          // parse the declaration's document, real I/O this fast,
          // per-keystroke-adjacent call shouldn't pay for on every finding.
          //
          // The ONE case hoisted here is cheaper: `varRef.defUri`/
          // `defRange` are already sitting on the finding's payload from
          // the sidecar's own parse (see VarRef's doc comment in
          // protocol.ts) — no I/O needed to know a bare-identifier
          // reference has no findable declaration/initializer at all
          // (e.g. a function parameter). That's provably never playable,
          // so it gets a single inert `$(question)  Unresolved` lens
          // instead of a Play that would always fail with the same
          // error resolveSong/resolveWadSynth/resolveToneSynth throw.
          // A wad.synth the sidecar already classified as unplayable (the
          // mic/sprite/preset decoys — see WadSynthPayload.unresolved)
          // gets the same inert lens; no client-side re-parse needed, the
          // refusal reason was known at parse time.
          if (finding.kind === 'wad.synth' && finding.payload.unresolved) {
            lenses.push(new ZzfxCodeLens(range, finding, 'unresolved', document.uri))
            break
          }
          const varRef = finding.payload.varRef
          if (varRef && (!varRef.defUri || !varRef.defRange)) {
            lenses.push(new ZzfxCodeLens(range, finding, 'unresolved', document.uri))
            break
          }
          lenses.push(new ZzfxCodeLens(range, finding, 'play', document.uri))
          lenses.push(new ZzfxCodeLens(range, finding, 'stop', document.uri))
          break
        }
        case 'audio.file': {
          if (!inlineEnabled) break
          // Progressive resolution (#41): fast tiers give a static
          // `▶ Play` + `⏹ Stop` pair immediately; a fast miss on a
          // searchable (plainly-relative) path shows `$(search)
          // Searching…` while the workspace-wide fallback runs, then the
          // Play+Stop pair or `$(search)  Not Found` once it settles. Only
          // an INELIGIBLE reference (URL/absolute — the search couldn't
          // mean anything) gets no lens at all.
          const resolution = this.audioResolver.getLensState(
            finding.payload.path,
            sourceDir,
            workspaceRoot
          )
          if (resolution.state === 'ineligible') break
          lenses.push(
            new ZzfxCodeLens(range, finding, 'play', document.uri, {
              resolution,
              ref: { path: finding.payload.path, sourceDir, workspaceRoot },
            })
          )
          // Stop doesn't need the resolution/ref payload — it's a static
          // stopSong call regardless of resolution state — but only
          // makes sense once there's a real path to have played, so it's
          // withheld for 'searching'/'not-found' the same as 'resolved'
          // is the only state that gets a Play lens that can actually play.
          if (resolution.state === 'resolved') {
            lenses.push(new ZzfxCodeLens(range, finding, 'stop', document.uri))
          }
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

    if (variant === 'unresolved') {
      // Not clickable — same inert shape as audio.file's `$(search)
      // Searching…` lens (empty command id). Unlike a searching/not-found
      // audio.file reference, this can never become resolved by a later
      // fallback search: the identifier provably has no declaration/
      // initializer to read (see provideCodeLenses), so there's nothing
      // to retry.
      // \u00A0 (non-breaking space) between the codicon and the label:
      // VS Code collapses a regular space that follows a `$(icon)` in a
      // CodeLens title, which rendered this as a bare, near-invisible icon
      // with no visible text in the shipped build (the old title had a
      // DOUBLE space, both collapsed). A non-breaking space survives it.
      // The e2e reads the lens OBJECT via executeCodeLensProvider, never
      // VS Code's painted output, so it could not catch this; spec matchers
      // normalize \s+ (which includes \u00A0), so they stay green.
      codeLens.command = { title: '$(question)\u00A0Unresolved', command: '' }
      return codeLens
    }

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
          command: 'threeFlatland.audio.playParams',
          arguments: [params, source],
        }
      } else {
        const isVar = Boolean(finding.payload.varRef)
        codeLens.command = {
          title: isVar ? '⚙ Edit (variable)' : '⚙ Edit',
          command: 'threeFlatland.audio.openEditor',
          arguments: [source],
        }
      }
    } else if (finding.kind === 'zzfxm.song') {
      // Resolution of the actual Song data (the harder, potentially
      // async/error-prone part) is deferred to the command handler in
      // register.ts — this only needs the finding's identity, mirroring
      // playParams'/openEditor's `{uri, findingId}` re-parse-fresh pattern.
      // Static Play+Stop pair — see the file doc comment for why (reverses
      // #46's toggle).
      codeLens.command =
        variant === 'stop'
          ? { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong', arguments: [] }
          : { title: '▶ Play', command: 'threeFlatland.audio.playSong', arguments: [source] }
    } else if (finding.kind === 'wad.synth') {
      // Same static pair shape as zzfxm.song — the resolver
      // (wadSynthResolver.ts, via register.ts's playWadSynth command) does
      // the actual config parsing/validation at click time; a var-ref that
      // doesn't resolve to a valid oscillator config surfaces as an error
      // message there, not as a different lens face here.
      codeLens.command =
        variant === 'stop'
          ? { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong', arguments: [] }
          : { title: '▶ Play', command: 'threeFlatland.audio.playWadSynth', arguments: [source] }
    } else if (finding.kind === 'tone.synth') {
      // Same static pair shape again — reuses the EXISTING generic
      // stopSong command (commandHandler.ts already routes every kind's
      // stop handle into the same currentSource slot stopSong/stop operate
      // on), no new stop command needed.
      codeLens.command =
        variant === 'stop'
          ? { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong', arguments: [] }
          : { title: '▶ Play', command: 'threeFlatland.audio.playToneSynth', arguments: [source] }
    } else if (variant === 'stop') {
      // audio.file's Stop lens — only ever emitted for the 'resolved'
      // state (provideCodeLenses), so it's unconditionally static; no
      // resolution/ref payload needed for a plain stopSong call.
      codeLens.command = { title: '⏹ Stop', command: 'threeFlatland.audio.stopSong', arguments: [] }
    } else {
      // audio.file's Play lens — the resolution state was computed once
      // in provideCodeLenses. Both actionable states route to playFile
      // with the reference triple as the second argument: the command
      // hands it back to the resolver, whose play-time verify/repair
      // covers a cached path that has since vanished (resolved state) and
      // a re-added asset behind a settled not-found (retry click). VS
      // Code renders `$(search)` as a codicon in lens titles.
      const { resolution, ref } = codeLens.audioFile!
      if (resolution.state === 'resolved') {
        codeLens.command = {
          title: '▶ Play',
          command: 'threeFlatland.audio.playFile',
          arguments: [resolution.path, ref, source],
        }
      } else if (resolution.state === 'searching') {
        // Not clickable while the fallback search is in flight — the
        // empty command id renders an inert lens; onDidChangeCodeLenses
        // fires when it settles.
        codeLens.command = { title: '$(search)\u00A0Searching…', command: '' }
      } else {
        // The retry click carries `source` too — a successful lazy-repair
        // play is a real playback and must mark its finding active.
        codeLens.command = {
          title: '$(search)\u00A0Not Found',
          command: 'threeFlatland.audio.playFile',
          arguments: [undefined, ref, source],
        }
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
