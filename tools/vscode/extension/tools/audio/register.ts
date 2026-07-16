import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import type { PlaySidecarClient, ToneSynthType } from '@three-flatland/audio-play'
import { getSidecarClient, shutdownSidecar } from './sidecarManager'
import { getPlaySidecarClient, shutdownPlaySidecar } from './playSidecarManager'
import { ZzfxCodeLensProvider, ZZFX_DOCUMENT_SELECTOR } from './provider'
import { ActivePlayback, watchPlaybackEnd } from './activePlayback'
import { AudioFileResolver } from './audioFileResolver'
import { createSourceEditorBindingHandlers } from './sourceEditorBinding'
import { openZzfxEditorPanel, playInAnyOpenPanel, playInEditorPanel } from './host'
import { resolveParams } from './resolveParams'
import { resolveSong } from './resolveSong'
import { resolveWadSynth } from './resolveWadSynth'
import { resolveToneSynth } from './resolveToneSynth'
import { getPlaybackVolumeMultiplier } from './playbackVolume'
import { isToolEnabled } from '../../toolRegistry'
import { log } from '../../log'
import { INLINE_PLAYBACK_SETTING } from './settings'

/** Cap on the slow audio.file basename search — the resolver only plays
 * one match, and an uncapped findFiles over a huge workspace buys nothing
 * past "enough candidates to rank" (see pickBestMatch). */
const MAX_AUDIO_SEARCH_RESULTS = 32

/** The most recently registered `ZzfxCodeLensProvider`, mirroring the
 * `sidecarManager.ts`/`playSidecarManager.ts` singleton-getter pattern —
 * lets `index.ts`'s `ExtensionApi` (and e2e tests through it) subscribe
 * to `onDidChangeCodeLenses` without needing `registerAudioTool`'s own
 * return type (a single aggregate `vscode.Disposable`, per the tool
 * registry contract) to carry it out. */
let activeProvider: ZzfxCodeLensProvider | null = null

/** e2e/diagnostic seam — see `index.ts`'s `ExtensionApi.zzfxCodeLens`.
 * Lets tests await the CodeLens provider's own refresh signal (fired when
 * `audioFileResolver.ts`'s async search settles, or a Tier-3 edit refresh
 * lands — see provider.ts) instead of polling to a wall-clock deadline. */
export function getZzfxCodeLensProvider(): ZzfxCodeLensProvider | null {
  return activeProvider
}

/** e2e/test-only determinism seam (finding #7,
 * planning/testing/pr188-adversarial-review.md) — mirrors `activeProvider`
 * above so `resetAudioToolState` can reach the live `ActivePlayback` /
 * `AudioFileResolver` instances without `registerAudioTool` exposing its
 * whole closure. */
let activeAudioState: { activePlayback: ActivePlayback; audioResolver: AudioFileResolver } | null =
  null

/**
 * e2e/test-only determinism seam (finding #7,
 * planning/testing/pr188-adversarial-review.md): fully resets the audio
 * tool's session state so a later test's behavior can't depend on how
 * long an earlier test happened to run. `e2e/fixtures.ts` shrinks the
 * audio-play sidecar's idle-release window (`FL_AUDIO_IDLE_RELEASE_MS`)
 * for the whole session — that timer lives INSIDE the sidecar process
 * (see `tools/audio-play/src/contextLifecycle.ts`) with no external
 * cancel, so shutting the process down outright is the only way to
 * guarantee no leftover idle state survives into the next test; the next
 * `play()` call spawns a fresh sidecar. Also clears the active-playback
 * record and the per-session `audio.file` resolver cache so neither
 * carries state from a previous test's (recopied) workspace fixture.
 * Every step here already no-ops when nothing is running/registered, so
 * this is safe to call whether or not the audio tool is currently
 * enabled. */
export async function resetAudioToolState(): Promise<void> {
  await shutdownPlaySidecar()
  activeAudioState?.activePlayback.clear()
  activeAudioState?.audioResolver.clear()
}

type ZzfxCallFinding = Extract<Finding, { kind: 'zzfx.call' }>
type ZzfxmSongFinding = Extract<Finding, { kind: 'zzfxm.song' }>
type WadSynthFinding = Extract<Finding, { kind: 'wad.synth' }>
type ToneSynthFinding = Extract<Finding, { kind: 'tone.synth' }>

function findFindingAtPosition(
  findings: readonly Finding[],
  position: vscode.Position
): ZzfxCallFinding | undefined {
  return findings.find((f): f is ZzfxCallFinding => {
    if (f.kind !== 'zzfx.call') return false
    const range = new vscode.Range(
      f.range.start.line,
      f.range.start.character,
      f.range.end.line,
      f.range.end.character
    )
    return range.contains(position)
  })
}

/**
 * Shared by `playAtCursor` and the no-arg (command palette) form of
 * `openEditor` — both need "the finding under the cursor in the active
 * editor," re-parsed fresh rather than trusting any cached snapshot.
 * Shows its own info messages and returns `undefined` for every failure
 * case so callers can just bail on a falsy result.
 */
async function resolveFindingAtCursor(
  client: CodelensServiceClient
): Promise<{ uri: vscode.Uri; finding: ZzfxCallFinding } | undefined> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showInformationMessage('FL ZzFX: no active editor.')
    return undefined
  }
  const { findings } = await client.parse({
    uri: editor.document.uri.toString(),
    text: editor.document.getText(),
  })
  const finding = findFindingAtPosition(findings, editor.selection.active)
  if (!finding) {
    void vscode.window.showInformationMessage('FL ZzFX: no zzfx() call at cursor.')
    return undefined
  }
  return { uri: editor.document.uri, finding }
}

/** Re-parses `uri` fresh and returns the `zzfxm.song` finding matching
 * `findingId`, or `undefined` if it's gone (edited away since the lens was
 * resolved). Mirrors `host.ts`'s `resolveFinding` for zzfx.call. */
async function resolveZzfxmSongFinding(
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<ZzfxmSongFinding | undefined> {
  const document = await vscode.workspace.openTextDocument(uri)
  const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
  return findings.find((f): f is ZzfxmSongFinding => f.kind === 'zzfxm.song' && f.id === findingId)
}

/** Re-parses `uri` fresh and returns the `wad.synth` finding matching
 * `findingId` — mirrors `resolveZzfxmSongFinding`. */
async function resolveWadSynthFindingById(
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<WadSynthFinding | undefined> {
  const document = await vscode.workspace.openTextDocument(uri)
  const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
  return findings.find((f): f is WadSynthFinding => f.kind === 'wad.synth' && f.id === findingId)
}

/** Re-parses `uri` fresh and returns the `tone.synth` finding matching
 * `findingId` — mirrors `resolveZzfxmSongFinding`. */
async function resolveToneSynthFindingById(
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<ToneSynthFinding | undefined> {
  const document = await vscode.workspace.openTextDocument(uri)
  const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
  return findings.find((f): f is ToneSynthFinding => f.kind === 'tone.synth' && f.id === findingId)
}

/**
 * Shared remote/setting/sidecar-availability guard for the `zzfxm.song`
 * and `audio.file` play routes. Unlike `playParams`, there is no
 * panel-based fallback for these (no editor webview plays a song or a raw
 * audio file) — a blocked route just shows an info message and no-ops.
 * Returns the ready-to-use client, or `undefined` after already showing
 * the appropriate message.
 */
function getInlinePlayClientOrNotify(
  context: vscode.ExtensionContext
): PlaySidecarClient | undefined {
  if (vscode.env.remoteName) {
    void vscode.window.showInformationMessage(
      'FL Audio: inline playback unavailable in remote windows.'
    )
    return undefined
  }
  if (!vscode.workspace.getConfiguration().get<boolean>(INLINE_PLAYBACK_SETTING, true)) {
    void vscode.window.showInformationMessage('FL Audio: inline playback is disabled in Settings.')
    return undefined
  }
  const playClient = getPlaySidecarClient(context)
  if (!playClient) {
    void vscode.window.showInformationMessage(
      'FL Audio: inline playback unavailable — the audio sidecar could not be started.'
    )
    return undefined
  }
  return playClient
}

/**
 * Attempts the inline (no-panel) play route for `playParams`'s "▶ Play"
 * CodeLens. Returns `false` — never throws — for either fallback trigger:
 * a remote window (no local speaker for the extension host's process to
 * play through) or the sidecar failing to resolve/spawn (logged via
 * `getPlaySidecarClient`/`PlaySidecarClient.onError`, not surfaced to the
 * user here — the caller's panel-based fallback is the user-visible
 * recovery).
 */
function tryPlayInline(context: vscode.ExtensionContext, params: number[]): boolean {
  if (vscode.env.remoteName) return false
  if (!vscode.workspace.getConfiguration().get<boolean>(INLINE_PLAYBACK_SETTING, true)) return false
  const playClient = getPlaySidecarClient(context)
  if (!playClient) return false
  try {
    // Trim read fresh per play so the current setting always wins — and
    // through the same mapping the tuner webview's gain uses, keeping the
    // two play paths matched by construction (see playbackVolume.ts).
    playClient.play(params, getPlaybackVolumeMultiplier())
    return true
  } catch (err) {
    log(
      `audio-play: inline play failed, falling back to panel: ${err instanceof Error ? err.message : err}`
    )
    return false
  }
}

export function registerAudioTool(context: vscode.ExtensionContext): vscode.Disposable {
  const disposables: vscode.Disposable[] = []

  // Per-session (per-activation) audio.file resolution cache + slow
  // workspace-search fallback — see audioFileResolver.ts's file doc
  // comment for the whole design. `onDidUpdate` re-renders lenses when an
  // async search settles; `provider` is assigned right below, and no
  // search can settle before registration completes.
  const audioResolver = new AudioFileResolver({
    findByBasename: async (basename) => {
      const uris = await vscode.workspace.findFiles(
        `**/${basename}`,
        '**/node_modules/**',
        MAX_AUDIO_SEARCH_RESULTS
      )
      return uris.map((uri) => uri.fsPath)
    },
    onDidUpdate: () => provider.refresh(),
  })
  // Which finding's sound is playing right now — NOT used to drive lens
  // rendering anymore (stakeholder reversal of #46's toggle: every
  // playable kind now shows a static Play+Stop pair, so lens content
  // never depends on active-playback state at all). Still needed for the
  // source-editor-tab-binding feature below (stop a sound when its
  // source document loses focus/closes), which is why `ActivePlayback`
  // itself — and `trackPlayback`'s calls into it — stay. `onDidChange` is
  // a no-op: re-rendering lenses on every play/stop would reintroduce the
  // exact refresh-round-trip churn the toggle removal exists to avoid,
  // for a state no lens face reads.
  const activePlayback = new ActivePlayback(() => {})
  const provider = new ZzfxCodeLensProvider(() => getSidecarClient(context), audioResolver)
  activeProvider = provider
  activeAudioState = { activePlayback, audioResolver }
  disposables.push(
    vscode.languages.registerCodeLensProvider(ZZFX_DOCUMENT_SELECTOR, provider),
    provider,
    {
      dispose: () => {
        if (activeProvider === provider) activeProvider = null
        if (activeAudioState?.activePlayback === activePlayback) activeAudioState = null
      },
    }
  )

  /** Marks `source` as the active playback (for the source-editor-tab-
   * binding listeners below) and watches the sidecar's exact timing (#43)
   * so `activePlayback` clears itself at the natural end too, not just on
   * an explicit stop or a replacement play — keeps tab-binding's "is
   * anything currently playing for this document" state accurate even
   * when nothing ever clicks Stop. Superseded by a manual stop or a
   * replacement play via the watcher's token. */
  function trackPlayback(
    playClient: PlaySidecarClient,
    source: { uri: string; findingId: string }
  ): void {
    const token = activePlayback.set({ findingId: source.findingId, sourceUri: source.uri })
    void watchPlaybackEnd(activePlayback, token, () => playClient.getStats())
  }

  /** The one stop path: manual ⏹ Stop clicks and the source-editor
   * binding both land here — sidecar stop + clear active. */
  function stopActivePlayback(): void {
    getPlaySidecarClient(context)?.stopSong()
    activePlayback.clear()
  }

  /** Whether any tab in any group still shows `uri` — the reliable
   * "source document is still open" signal, injected into the binding
   * below. `onDidCloseTextDocument` alone can't carry the close half of
   * the binding: VS Code disposes TextDocuments lazily, so closing a tab
   * is NOT guaranteed to fire it (per its own API docs) — proven live by
   * the e2e close test, where the event never arrived inside the
   * playback window. */
  function isDocumentOpenInSomeTab(uri: string): boolean {
    return vscode.window.tabGroups.all.some((group) =>
      group.tabs.some(
        (tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri
      )
    )
  }

  // Source-editor binding (#46): a playing sound belongs to its source
  // document — see sourceEditorBinding.ts's file doc comment for the full
  // rationale and sourceEditorBinding.test.ts for its unit coverage
  // (finding #6, planning/testing/pr188-adversarial-review.md). These
  // three listeners just adapt the real vscode events down to the
  // URI/callback primitives the extracted handlers take.
  const sourceEditorBinding = createSourceEditorBindingHandlers({
    activePlayback,
    stop: stopActivePlayback,
    isDocumentOpenInSomeTab,
  })
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      sourceEditorBinding.onDidChangeActiveTextEditor(editor?.document.uri.toString())
    ),
    vscode.window.tabGroups.onDidChangeTabs(() => sourceEditorBinding.onDidChangeTabs()),
    vscode.workspace.onDidCloseTextDocument((document) =>
      sourceEditorBinding.onDidCloseTextDocument(document.uri.toString())
    )
  )

  // Tier 1 (shallow workspace scan): warm the sidecar's SQLite cache on
  // activation. Best-effort — provideCodeLenses never depends on this
  // having run; it always re-parses whichever document VS Code asks about.
  void getSidecarClient(context).then((client) => {
    if (!client) return
    client.scan({}).catch(() => {
      // Best-effort warm-up — sidecarManager already logs the failure.
    })
  })

  // Tier 3 (incremental on change): notify + debounce-refresh CodeLenses.
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!vscode.languages.match(ZZFX_DOCUMENT_SELECTOR, e.document)) return
      void getSidecarClient(context).then((client) => {
        if (client) provider.scheduleRefresh(client, e.document)
      })
    })
  )

  // CodeLens-only — takes a raw params array as its primary argument, no
  // sensible cursor-based fallback, so (per
  // planning/vscode-tools/tool-zzfx-studio.md) it is NOT listed in
  // package.json's contributes.commands for the command palette. Still a
  // real registered command: CodeLens titles reference it by id directly.
  //
  // Routes through the audio-play sidecar (real AudioContext, no webview
  // panel) — a click on "▶ Play" above a source-code call site shouldn't
  // have to open/reuse an editor panel just to hear a one-shot. Falls
  // back to the pre-Z9 panel-based route (`source`'s own editor panel, or
  // whichever zzfx panel is already open) in two cases: a remote window
  // (`vscode.env.remoteName` set — the extension host's process has no
  // local audio device to play through), or the sidecar failing to spawn
  // at all. `source`, when supplied (the CodeLens always supplies it —
  // see provider.ts), carries the real finding this play request is for,
  // used only by the fallback path to open/reuse that finding's own
  // editor panel rather than needing a synthetic one.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.playParams',
      async (params: number[], source?: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard
        // comment. Reachable here only via a direct command invocation
        // (no command-palette entry) since the CodeLens itself can't
        // exist while the provider above is unregistered.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        if (tryPlayInline(context, params)) return

        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL Audio: sidecar unavailable.')
          return
        }
        if (source) {
          await playInEditorPanel(
            context,
            client,
            vscode.Uri.parse(source.uri),
            source.findingId,
            params
          )
          return
        }
        // No finding context to open a panel from scratch — reuse
        // whichever zzfx panel is already open, if any.
        if (!(await playInAnyOpenPanel(params))) {
          void vscode.window.showInformationMessage(
            'FL ZzFX: open a ZzFX editor (⚙ Edit) first, then Play.'
          )
        }
      }
    )
  )

  disposables.push(
    vscode.commands.registerCommand('threeFlatland.audio.playAtCursor', async () => {
      // Defense in depth — see atlas/register.ts's identical guard comment.
      if (!isToolEnabled('audio')) {
        void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
        return
      }
      const client = await getSidecarClient(context)
      if (!client) {
        void vscode.window.showErrorMessage('FL Audio: sidecar unavailable.')
        return
      }
      const resolved = await resolveFindingAtCursor(client)
      if (!resolved) return
      const { params } = await resolveParams(resolved.finding)
      await playInEditorPanel(context, client, resolved.uri, resolved.finding.id, params)
    })
  )

  // Dual-mode: CodeLens invokes with `{uri, findingId}` for a specific
  // call site; the command-palette form ("FL: Open ZzFX Editor") is
  // invoked with no args and falls back to the finding under the cursor,
  // same resolution playAtCursor uses.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.openEditor',
      async (arg?: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL Audio: sidecar unavailable — cannot open editor.')
          return
        }
        if (arg) {
          await openZzfxEditorPanel(context, client, vscode.Uri.parse(arg.uri), arg.findingId)
          return
        }
        const resolved = await resolveFindingAtCursor(client)
        if (!resolved) return
        await openZzfxEditorPanel(context, client, resolved.uri, resolved.finding.id)
      }
    )
  )

  // CodeLens-only, like playParams — the `{uri, findingId}` shape lets this
  // re-parse fresh and resolve the actual Song data itself, rather than
  // trusting anything the provider snapshotted at lens-resolve time.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.playSong',
      async (source: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        const playClient = getInlinePlayClientOrNotify(context)
        if (!playClient) return

        const uri = vscode.Uri.parse(source.uri)
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL Audio: sidecar unavailable.')
          return
        }
        const finding = await resolveZzfxmSongFinding(client, uri, source.findingId)
        if (!finding) {
          void vscode.window.showErrorMessage(
            'FL Audio: this zzfxm() call could not be found — the source may have changed.'
          )
          return
        }
        const resolved = await resolveSong(uri, finding)
        if ('loadError' in resolved) {
          void vscode.window.showErrorMessage(`FL Audio: ${resolved.loadError}`)
          return
        }
        playClient.playSong(resolved.song, getPlaybackVolumeMultiplier())
        // Marks this finding as the active playback for the source-editor
        // tab-binding listeners — no lens state to update anymore.
        trackPlayback(playClient, source)
      }
    )
  )

  // CodeLens-only, like playSong — re-parses fresh, resolves the Wad
  // synthesis config via wadSynthResolver.ts (parse-don't-eval, same
  // posture as songResolver.ts), then plays it. Wad's constructor loads
  // synchronously (createRequire, see audio-play's sidecar.ts) — no
  // cold-start race to retry around, unlike playToneSynth below.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.playWadSynth',
      async (source: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        const playClient = getInlinePlayClientOrNotify(context)
        if (!playClient) return

        const uri = vscode.Uri.parse(source.uri)
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL Audio: sidecar unavailable.')
          return
        }
        const finding = await resolveWadSynthFindingById(client, uri, source.findingId)
        if (!finding) {
          void vscode.window.showErrorMessage(
            'FL Audio: this Wad() call could not be found — the source may have changed.'
          )
          return
        }
        const resolved = await resolveWadSynth(uri, finding)
        if ('loadError' in resolved) {
          void vscode.window.showErrorMessage(`FL Audio: ${resolved.loadError}`)
          return
        }
        playClient.playWadSynth(resolved.config, getPlaybackVolumeMultiplier())
        // Marks this finding as the active playback for the source-editor
        // tab-binding listeners — no lens state to update anymore.
        trackPlayback(playClient, source)
      }
    )
  )

  // CodeLens-only, like playSong — re-parses fresh, resolves the Tone.js
  // playback args via toneSynthResolver.ts, then plays it through the
  // id-correlated `playToneSynthAwaitable` command (#47/#49). The
  // sidecar's own `playToneSynth` backend awaits its lazily-loaded Tone.js
  // engine (bounded — see `tools/audio-play/src/sidecar.ts`'s
  // `loadToneEngineBounded`) before Acking/Nacking, so the session's very
  // first Tone play genuinely waits for the engine instead of Nacking
  // once and requiring a client-side retry — this handler just awaits
  // THAT one response and shows a single graceful error on a genuine
  // Nack. `.catch` normalizes a transport-level rejection (sidecar not
  // running, response timeout — see `waitForResponse` in `client.ts`)
  // into the same shape as a remote Nack, so both failure modes land on
  // the one error path below. `trackPlayback` fires exactly once, only
  // after a successful response.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.playToneSynth',
      async (source: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        const playClient = getInlinePlayClientOrNotify(context)
        if (!playClient) return

        const uri = vscode.Uri.parse(source.uri)
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL Audio: sidecar unavailable.')
          return
        }
        const finding = await resolveToneSynthFindingById(client, uri, source.findingId)
        if (!finding) {
          void vscode.window.showErrorMessage(
            'FL Audio: this Tone.js call could not be found — the source may have changed.'
          )
          return
        }
        const resolved = await resolveToneSynth(uri, finding)
        if ('loadError' in resolved) {
          void vscode.window.showErrorMessage(`FL Audio: ${resolved.loadError}`)
          return
        }
        // synthType/voiceType were already validated against the 9-name
        // allowlist sidecar-side (tone.synth's fully-static-or-nothing
        // detection) — safe to narrow the resolver's plain `string` back
        // to the wire's ToneSynthType here.
        const response = await playClient
          .playToneSynthAwaitable(
            {
              synthType: resolved.synthType as ToneSynthType,
              voiceType: resolved.voiceType as ToneSynthType | undefined,
              note: resolved.note,
              duration: resolved.duration,
            },
            getPlaybackVolumeMultiplier()
          )
          .catch((error: unknown): { ok: false; error: string } => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }))
        if (!response.ok) {
          void vscode.window.showErrorMessage(`FL Audio: ${response.error}`)
          return
        }
        // Marks this finding as the active playback for the source-editor
        // tab-binding listeners — no lens state to update anymore.
        trackPlayback(playClient, source)
      }
    )
  )

  disposables.push(
    vscode.commands.registerCommand('threeFlatland.audio.stopSong', () => {
      // Defense in depth — see atlas/register.ts's identical guard comment.
      if (!isToolEnabled('audio')) {
        void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
        return
      }
      // The sidecar stop itself no-ops if nothing is running — no need to
      // gate on remote/setting here beyond getting a client handle at all.
      stopActivePlayback()
    })
  )

  // CodeLens-only — `absolutePath` is the resolver's answer baked into
  // the lens (undefined for a `$(search) Not Found` lens's retry click);
  // `ref` is the reference triple handed back to the resolver so it can
  // trust-but-verify on use: re-stat the cached path, and if the file has
  // since been deleted/moved (or a re-added asset sits behind a settled
  // not-found), re-run the full fast→slow resolution before playing —
  // the lazy self-repair from #41. A legacy direct invocation with only a
  // path skips the repair and plays it as-is.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.audio.playFile',
      async (
        absolutePath: string | undefined,
        ref?: { path: string; sourceDir: string; workspaceRoot: string },
        source?: { uri: string; findingId: string }
      ) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('audio')) {
          void vscode.window.showInformationMessage('FL Audio is disabled in Settings.')
          return
        }
        const playClient = getInlinePlayClientOrNotify(context)
        if (!playClient) return

        const resolved = ref
          ? await audioResolver.resolveForPlay(ref.path, ref.sourceDir, ref.workspaceRoot)
          : absolutePath
        if (!resolved) {
          void vscode.window.showInformationMessage(
            `FL Audio: "${ref?.path ?? absolutePath}" was not found anywhere in this workspace.`
          )
          return
        }
        playClient.playFile(resolved, getPlaybackVolumeMultiplier())
        // Same tab-binding tracking as playSong. `source` is additive —
        // the lens always supplies it; a legacy direct invocation without
        // one just plays with no active-playback state to track.
        if (source) trackPlayback(playClient, source)
      }
    )
  )

  // Turning inline playback off mid-session shouldn't leave an already-
  // spawned audio-play sidecar process lingering — the setting means "no
  // playback at all," not just "no *new* sidecars." provider.refresh()
  // re-runs provideCodeLenses for every open document so the Play/Stop
  // lenses this setting gates (see provider.ts) disappear/reappear live,
  // without waiting for the next edit.
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(INLINE_PLAYBACK_SETTING)) return
      const enabled = vscode.workspace
        .getConfiguration()
        .get<boolean>(INLINE_PLAYBACK_SETTING, true)
      if (!enabled) void shutdownPlaySidecar()
      provider.refresh()
    })
  )

  disposables.push({ dispose: () => void shutdownSidecar() })
  disposables.push({ dispose: () => void shutdownPlaySidecar() })

  return vscode.Disposable.from(...disposables)
}
