import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import type { PlaySidecarClient } from '@three-flatland/zzfx-play'
import { getSidecarClient, shutdownSidecar } from './sidecarManager'
import { getPlaySidecarClient, shutdownPlaySidecar } from './playSidecarManager'
import { ZzfxCodeLensProvider, ZZFX_DOCUMENT_SELECTOR } from './provider'
import { AudioFileResolver } from './audioFileResolver'
import { openZzfxEditorPanel, playInAnyOpenPanel, playInEditorPanel } from './host'
import { resolveParams } from './resolveParams'
import { resolveSong } from './resolveSong'
import { getPlaybackVolumeMultiplier } from './playbackVolume'
import { isToolEnabled } from '../../toolRegistry'
import { log } from '../../log'

const INLINE_PLAYBACK_SETTING = 'threeFlatland.zzfx.inlinePlayback.enabled'

/** Cap on the slow audio.file basename search — the resolver only plays
 * one match, and an uncapped findFiles over a huge workspace buys nothing
 * past "enough candidates to rank" (see pickBestMatch). */
const MAX_AUDIO_SEARCH_RESULTS = 32

type ZzfxCallFinding = Extract<Finding, { kind: 'zzfx.call' }>
type ZzfxmSongFinding = Extract<Finding, { kind: 'zzfxm.song' }>

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
      `zzfx-play: inline play failed, falling back to panel: ${err instanceof Error ? err.message : err}`
    )
    return false
  }
}

export function registerZzfxTool(context: vscode.ExtensionContext): vscode.Disposable {
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
  const provider = new ZzfxCodeLensProvider(() => getSidecarClient(context), audioResolver)
  disposables.push(
    vscode.languages.registerCodeLensProvider(ZZFX_DOCUMENT_SELECTOR, provider),
    provider
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
  // Routes through the zzfx-play sidecar (real AudioContext, no webview
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
      'threeFlatland.zzfx.playParams',
      async (params: number[], source?: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard
        // comment. Reachable here only via a direct command invocation
        // (no command-palette entry) since the CodeLens itself can't
        // exist while the provider above is unregistered.
        if (!isToolEnabled('zzfxStudio')) {
          void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
          return
        }
        if (tryPlayInline(context, params)) return

        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL ZzFX: sidecar unavailable.')
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
    vscode.commands.registerCommand('threeFlatland.zzfx.playAtCursor', async () => {
      // Defense in depth — see atlas/register.ts's identical guard comment.
      if (!isToolEnabled('zzfxStudio')) {
        void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
        return
      }
      const client = await getSidecarClient(context)
      if (!client) {
        void vscode.window.showErrorMessage('FL ZzFX: sidecar unavailable.')
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
      'threeFlatland.zzfx.openEditor',
      async (arg?: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('zzfxStudio')) {
          void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
          return
        }
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL ZzFX: sidecar unavailable — cannot open editor.')
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
      'threeFlatland.zzfx.playSong',
      async (source: { uri: string; findingId: string }) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('zzfxStudio')) {
          void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
          return
        }
        const playClient = getInlinePlayClientOrNotify(context)
        if (!playClient) return

        const uri = vscode.Uri.parse(source.uri)
        const client = await getSidecarClient(context)
        if (!client) {
          void vscode.window.showErrorMessage('FL ZzFX: sidecar unavailable.')
          return
        }
        const finding = await resolveZzfxmSongFinding(client, uri, source.findingId)
        if (!finding) {
          void vscode.window.showErrorMessage(
            'FL ZzFX: this zzfxm() call could not be found — the source may have changed.'
          )
          return
        }
        const resolved = await resolveSong(uri, finding)
        if ('loadError' in resolved) {
          void vscode.window.showErrorMessage(`FL ZzFX: ${resolved.loadError}`)
          return
        }
        playClient.playSong(resolved.song, getPlaybackVolumeMultiplier())
      }
    )
  )

  disposables.push(
    vscode.commands.registerCommand('threeFlatland.zzfx.stopSong', () => {
      // Defense in depth — see atlas/register.ts's identical guard comment.
      if (!isToolEnabled('zzfxStudio')) {
        void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
        return
      }
      // stopSong() itself no-ops if nothing is running — no need to gate
      // on remote/setting here beyond getting a client handle at all.
      getPlaySidecarClient(context)?.stopSong()
    })
  )

  // CodeLens-only — `absolutePath` is the resolver's answer baked into
  // the lens (undefined for a `$(search) not found` lens's retry click);
  // `ref` is the reference triple handed back to the resolver so it can
  // trust-but-verify on use: re-stat the cached path, and if the file has
  // since been deleted/moved (or a re-added asset sits behind a settled
  // not-found), re-run the full fast→slow resolution before playing —
  // the lazy self-repair from #41. A legacy direct invocation with only a
  // path skips the repair and plays it as-is.
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.zzfx.playFile',
      async (
        absolutePath: string | undefined,
        ref?: { path: string; sourceDir: string; workspaceRoot: string }
      ) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('zzfxStudio')) {
          void vscode.window.showInformationMessage('FL ZzFX Studio is disabled in Settings.')
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
      }
    )
  )

  // Turning inline playback off mid-session shouldn't leave an already-
  // spawned zzfx-play sidecar process lingering — the setting means
  // "the panel route only," not just "no *new* sidecars."
  disposables.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(INLINE_PLAYBACK_SETTING)) return
      const enabled = vscode.workspace
        .getConfiguration()
        .get<boolean>(INLINE_PLAYBACK_SETTING, true)
      if (!enabled) void shutdownPlaySidecar()
    })
  )

  disposables.push({ dispose: () => void shutdownSidecar() })
  disposables.push({ dispose: () => void shutdownPlaySidecar() })

  return vscode.Disposable.from(...disposables)
}
