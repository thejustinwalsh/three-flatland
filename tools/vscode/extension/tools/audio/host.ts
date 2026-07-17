// Opens/focuses the FL ZzFX Studio editor webview (webview/audio/) for one
// finding. Wires the full bridge contract documented in
// webview/audio/README.md — this file is exactly the "What Z3 needs to add"
// snippet from that doc, plus the rest of the panel-lifecycle boilerplate
// every tool follows (composeToolHtml, dev-reload, client/log).
import * as vscode from 'vscode'
import { createHostBridge, type HostBridge } from '@three-flatland/bridge/host'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'
import { batchFromOutcome, historyKeyFor } from './history/core'
import { getZzfxHistoryStore } from './history/store'
import { getPlaybackVolumeMultiplier, PLAYBACK_VOLUME_SETTING } from './playbackVolume'
import { PRESET_LIBRARY } from './lm/core'
import { ZzfxLmService } from './lm/service'
import { isNumberArrayLiteralText, resolveParams } from './resolveParams'
import { getSidecarClient } from './sidecarManager'
import { rangeFromWire } from './wireRange'

const TOOL = 'audio'

type ZzfxGeneratePayload = { category: string; styles: string[]; n: number }
type ZzfxSavePayload = { findingId: string; params: number[]; category?: string; styles?: string[] }
type ZzfxHistoryDeletePayload = { batchTs: number; index: number }

type OpenPanel = {
  panel: vscode.WebviewPanel
  bridge: HostBridge
  /** Resolves once this panel's `zzfx/ready` handshake has completed at
   * least once — already-resolved for a reused panel. `playInEditorPanel`
   * awaits this before emitting `zzfx/play` so the event is never posted
   * to a webview whose bridge listener hasn't attached yet. */
  ready: Promise<void>
}

// One panel per findingId — re-invoking "Edit" on the same call site
// focuses the existing panel instead of opening a duplicate.
const openPanels = new Map<string, OpenPanel>()

// ONE ZzfxLmService for the whole extension host, not one per panel (#148
// Z7b Finding B) — each instance lazily loads + holds its own in-memory
// LM-response cache map (`lm/service.ts`'s `cachedMap`); two panels each
// constructing their own meant two independent maps racing to blind-
// overwrite the SAME cache file, so a concurrent Generate in one panel
// could silently drop a concurrent Generate's entry in the other. A
// single shared instance makes same-process writes correct by
// construction (JS mutates the ONE shared in-memory map synchronously,
// with no window for two same-process calls to interleave); the
// remaining cross-process case (a second VS Code window sharing this
// `globalStorageUri`) is handled by `cacheStore()`'s own read-merge-write
// persist step, not by this singleton.
let lmServiceInstance: ZzfxLmService | undefined
function getLmService(context: vscode.ExtensionContext): ZzfxLmService {
  if (!lmServiceInstance) lmServiceInstance = new ZzfxLmService(context)
  return lmServiceInstance
}

/** Re-parses the live document text and returns the finding matching
 * `findingId`, or `undefined` if it's gone (edited away, file changed
 * externally since the panel opened, etc.). Always re-parses fresh rather
 * than trusting any earlier snapshot — the panel may have been open for a
 * while and the source may have moved on. */
async function resolveFinding(
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<{ document: vscode.TextDocument; finding: ZzfxCallFinding } | undefined> {
  const document = await vscode.workspace.openTextDocument(uri)
  const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
  const finding = findings.find(
    (f): f is Extract<typeof f, { kind: 'zzfx.call' }> => f.kind === 'zzfx.call' && f.id === findingId
  )
  if (!finding) return undefined
  return { document, finding }
}

const SAVE_RESOLVE_MAX_ATTEMPTS = 2

/**
 * Save-specific finding resolution — layers a `document.version` guard on
 * top of {@link resolveFinding}'s plain re-parse-and-locate (#148 Z7b
 * Finding A). `client.parse` is an async IPC round-trip to the sidecar;
 * if the document changes while it's in flight, the range the parse just
 * computed no longer corresponds to the CURRENT document text, and
 * applying a `WorkspaceEdit` built from it would silently edit the wrong
 * location — the id-equality check alone doesn't catch this, since the id
 * lookup can still succeed against a range that's already gone stale by
 * the time this function returns.
 *
 * Captures `document.version` immediately before calling `client.parse`;
 * if it's different by the time the parse resolves, retries the whole
 * parse-and-locate step once (edits settle fast in practice — a single
 * retry is enough for the common case of one intervening keystroke).
 * Gives up (returns `undefined`, same as an id-miss) if the version is
 * STILL moving on the retry, rather than ever hand back a
 * (document, finding) pair computed against a version that's no longer
 * current. The caller applies its edit immediately after this resolves,
 * with no further `await` in between — closing the race this guards.
 */
async function resolveFindingForSave(
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<{ document: vscode.TextDocument; finding: ZzfxCallFinding } | undefined> {
  for (let attempt = 0; attempt < SAVE_RESOLVE_MAX_ATTEMPTS; attempt++) {
    const document = await vscode.workspace.openTextDocument(uri)
    const versionAtParse = document.version
    const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
    if (document.version !== versionAtParse) continue
    const finding = findings.find(
      (f): f is Extract<typeof f, { kind: 'zzfx.call' }> => f.kind === 'zzfx.call' && f.id === findingId
    )
    if (!finding) return undefined
    return { document, finding }
  }
  return undefined
}

type ZzfxCallFinding = Extract<Finding, { kind: 'zzfx.call' }>

export async function openZzfxEditorPanel(
  context: vscode.ExtensionContext,
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<void> {
  const resolved = await resolveFinding(client, uri, findingId)
  if (!resolved) {
    void vscode.window.showErrorMessage('FL ZzFX: this zzfx() call could not be found — the source may have changed.')
    return
  }
  const { finding } = resolved

  const existing = openPanels.get(findingId)
  if (existing) {
    existing.panel.reveal()
    return
  }

  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.zzfx',
    `ZzFX: ${uri.path.split('/').pop() ?? 'sound'}:${finding.range.start.line + 1}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    }
  )

  const renderHtml = async () =>
    composeToolHtml({ webview: panel.webview, tool: TOOL, extensionUri: context.extensionUri })
  panel.webview.html = await renderHtml()

  const bridge = createHostBridge(panel.webview)
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  openPanels.set(findingId, { panel, bridge, ready })

  const lmService = getLmService(context)

  // AI candidate history — keyed to the SAME source identity the header
  // link shows (variable → declaration, literal → call site line), so
  // "mapped to the link we generated from" holds by construction. The
  // key is an open-time snapshot, consistent with the panel title / the
  // link's tolerant staleness semantics (see history/core.ts).
  const historyStore = getZzfxHistoryStore(context)
  const historyKey = historyKeyFor({
    uri: uri.toString(),
    line: finding.range.start.line,
    varRef: finding.payload.varRef,
  })

  bridge.on('zzfx/ready', async () => {
    log(`zzfx/ready for finding ${findingId}`)
    // For a variable-spread call, payload.params is genuinely empty — the
    // resolved values live only in the declaration's source text. Resolve
    // before sending init so the sliders start at NAME's actual values,
    // not all-defaults. `loadError` (set when the initializer couldn't
    // be read as a plain number array) rides along so the webview can
    // surface it and refuse Save — see useZzfxSession.ts/App.tsx.
    const { params, loadError } = await resolveParams(finding)
    bridge.emit('zzfx/init', {
      findingId,
      uri: uri.toString(),
      // Header source link — call-site location (finding.range is the
      // call for var-ref findings too), snapshotted at open time like the
      // panel title; zzfx/revealSource below re-resolves the live
      // position on click. `def` carries the DECLARATION's location for a
      // var-ref with a readable initializer — the link shows the variable
      // name and reveals the declaration in that case, since that's what
      // Save writes to.
      sourcePath: vscode.workspace.asRelativePath(uri),
      sourceLine: finding.range.start.line,
      def:
        finding.payload.varRef?.defUri && finding.payload.varRef.defRange
          ? {
              path: vscode.workspace.asRelativePath(vscode.Uri.parse(finding.payload.varRef.defUri)),
              line: finding.payload.varRef.defRange.start.line,
            }
          : undefined,
      params,
      varRef: finding.payload.varRef,
      loadError,
      lmAvailable: await lmService.isAvailable(),
      presets: PRESET_LIBRARY,
      history: await historyStore.getBatches(historyKey),
      // User playback-volume trim, already resolved to a gain multiplier
      // (the webview stays mapping-agnostic; one dB→gain mapping lives in
      // volumeTrim.ts, shared with the inline sidecar route so both play
      // paths stay matched). Live changes push via zzfx/config below.
      playbackVolume: getPlaybackVolumeMultiplier(),
    })
    resolveReady()
    return { ok: true }
  })

  // Live-push the playback-volume trim so the panel's gain tracks the
  // setting without a reload — same multiplier the inline route reads
  // per play.
  const disposeConfigListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(PLAYBACK_VOLUME_SETTING)) return
    bridge.emit('zzfx/config', { playbackVolume: getPlaybackVolumeMultiplier() })
  })

  bridge.on<ZzfxGeneratePayload>('zzfx/generate', async ({ category, styles, n }) => {
    const outcome = await lmService.generate({ category, styles, n }, (chunk) =>
      bridge.emit('zzfx/generateProgress', { chunk })
    )
    bridge.emit('zzfx/generateResult', {
      candidates: outcome.candidates,
      fromCache: outcome.source === 'cache',
      source: outcome.source,
    })
    // Durability is host-owned: persist at the same moment the result is
    // emitted, so a panel move/reload can never lose a paid-for batch.
    // batchFromOutcome returns null for preset/empty outcomes (free +
    // deterministic — deliberately not persisted).
    const batch = batchFromOutcome(outcome, { category, styles }, Date.now())
    if (batch) {
      const history = await historyStore.append(historyKey, batch)
      bridge.emit('zzfx/historyChanged', { history })
    }
    return { ok: true }
  })

  bridge.on<ZzfxHistoryDeletePayload>('zzfx/history/delete', async ({ batchTs, index }) => {
    const history = await historyStore.deleteCandidate(historyKey, batchTs, index)
    bridge.emit('zzfx/historyChanged', { history })
    return { ok: true }
  })

  bridge.on('zzfx/history/clear', async () => {
    const history = await historyStore.clear(historyKey)
    bridge.emit('zzfx/historyChanged', { history })
    return { ok: true }
  })

  bridge.on<ZzfxSavePayload>('zzfx/save', async ({ findingId: fid, params }) => {
    // Fetch the CURRENT sidecar client rather than closing over `client`
    // (the panel-open-time value) — if the codelens-service sidecar
    // crashed and respawned while this panel stayed open (sidecarManager.ts
    // nulls the singleton on exit; the next getSidecarClient() call gets a
    // fresh one), the captured `client` is permanently exited and every
    // call on it rejects. Save is long-lived (fires arbitrarily later, not
    // just at open time), so it must always resolve against whatever
    // client is live right now.
    const liveClient = await getSidecarClient(context)
    if (!liveClient) {
      throw new Error('FL ZzFX: sidecar unavailable — cannot save right now.')
    }
    const current = await resolveFindingForSave(liveClient, uri, fid)
    if (!current) {
      throw new Error('This zzfx() call could not be found — the source may have changed since the panel opened.')
    }
    const { document, finding: currentFinding } = current
    // Snapshot right after resolveFindingForSave's own version check has
    // already confirmed `document` is consistent with the parse that
    // produced `varRef.defRange` — the baseline the def-document version
    // guard below compares against.
    const versionAfterResolve = document.version
    const edit = new vscode.WorkspaceEdit()
    const varRef = currentFinding.payload.varRef
    if (varRef?.defRange && varRef.defUri) {
      // Variable case: rewrite the declaration's VALUE (the array
      // literal), not the call site's `...VARNAME` spread — matches
      // planning doc: "edit the variable's value range."
      //
      // Two independent guards, both required (#148 Z7b part 2):
      //
      // 1. Shape revalidation. The sidecar reports `defRange` for
      //    WHATEVER initializer expression is there — it does not
      //    validate that it's actually an array literal (`const preset =
      //    getPreset()` still reports the call expression's range; see
      //    tools/codelens-service/CLAUDE.md's `varRef.defRange` contract:
      //    "the sidecar reports the range, it doesn't validate the
      //    shape; that's the client's job"). Blindly overwriting that
      //    range with `[${params...}]` would silently turn a function
      //    call (or any other non-array expression) into a hardcoded
      //    array — a real, surprising rewrite that has nothing to do
      //    with "save my slider changes." Uses the SAME
      //    `isNumberArrayLiteralText` check `resolveParams.ts` reads
      //    with, so read and write never disagree about what counts as
      //    "a preset array."
      //
      // 2. Document-version guard on the DEF document specifically —
      //    NOT redundant with resolveFindingForSave's own guard on the
      //    call-site document. The finding id is derived from the CALL
      //    SITE's byte range + its (empty, for a var-ref) params — it
      //    does NOT change when the variable's initializer changes, so a
      //    successful id re-location says nothing about whether the
      //    initializer text shifted underneath `defRange`'s coordinates
      //    in the gap since resolveFindingForSave's parse. In the
      //    common (v0/single-file) case `defUri === document.uri`, so
      //    `document.version` — a live getter, already reflecting
      //    whatever's current by the time we check it here — is the
      //    same guarantee Finding A gave the call-site path, applied to
      //    this one.
      const defUri = vscode.Uri.parse(varRef.defUri)
      const defDoc = await vscode.workspace.openTextDocument(defUri)
      if (defUri.toString() === document.uri.toString() && defDoc.version !== versionAfterResolve) {
        throw new Error(`"${varRef.name}"'s declaration changed while saving — please try again.`)
      }
      const currentInitializerText = defDoc.getText(rangeFromWire(varRef.defRange)).trim()
      if (!isNumberArrayLiteralText(currentInitializerText)) {
        const preview =
          currentInitializerText.length > 40 ? `${currentInitializerText.slice(0, 40)}…` : currentInitializerText
        throw new Error(
          `Can't save "${varRef.name}" — its declaration is not a plain array literal ` +
            `(found "${preview}"). Edit the source directly for this case.`
        )
      }
      edit.replace(defUri, rangeFromWire(varRef.defRange), `[${params.join(', ')}]`)
    } else {
      edit.replace(document.uri, rangeFromWire(currentFinding.payload.argRange), params.join(', '))
    }
    const applied = await vscode.workspace.applyEdit(edit)
    if (!applied) throw new Error('Failed to apply the edit — the document may be read-only.')
    return { ok: true }
  })

  bridge.on('zzfx/revealSource', async () => {
    // Re-resolve the finding's CURRENT position by id — the source may
    // have moved since the panel opened. showTextDocument without
    // preserveFocus deliberately FOCUSES the revealed editor (unlike the
    // play routes): the link's whole job is "take me there". A var-ref
    // with a readable declaration reveals the DECLARATION with the
    // initializer selected — that's what Save writes to; everything else
    // reveals the call site with the call selected. Fetch the CURRENT
    // sidecar client, same reasoning as zzfx/save above — this handler is
    // long-lived and must not stay bound to a client that exited and
    // respawned since the panel opened. A resolve failure (sidecar still
    // unavailable) falls through to the open-time snapshot below, same as
    // a genuine "finding not found" — reveal is navigation, not a
    // correctness-critical write, so a stale-ish reveal beats an error
    // toast here too.
    const liveClient = await getSidecarClient(context)
    const current = liveClient ? await resolveFinding(liveClient, uri, findingId) : undefined
    if (current) {
      const varRef = current.finding.payload.varRef
      if (varRef?.defUri && varRef.defRange) {
        const defDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(varRef.defUri))
        await vscode.window.showTextDocument(defDoc, { selection: rangeFromWire(varRef.defRange) })
      } else {
        await vscode.window.showTextDocument(current.document, {
          selection: rangeFromWire(current.finding.range),
        })
      }
      return { ok: true }
    }
    // Gone entirely (edited away) — fall back to the OPEN-TIME snapshot's
    // target file at its open-time line, cursor-collapsed (a stale range
    // could select the wrong text), clamped. A stale-ish reveal beats an
    // error toast for a navigation click.
    const varRef = finding.payload.varRef
    const targetUri = varRef?.defUri && varRef.defRange ? vscode.Uri.parse(varRef.defUri) : uri
    const storedLine = varRef?.defUri && varRef.defRange ? varRef.defRange.start.line : finding.range.start.line
    const document = await vscode.workspace.openTextDocument(targetUri)
    const line = Math.min(storedLine, document.lineCount - 1)
    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(line, 0, line, 0),
    })
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  const disposeReload = setupDevReload(context.extensionUri, TOOL, () => bridge.emit('dev/reload', { tool: TOOL }))
  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })

  panel.onDidDispose(() => {
    disposeConfigListener.dispose()
    disposeReload.dispose()
    bridge.dispose()
    openPanels.delete(findingId)
  })
}

/**
 * Opens/reveals `findingId`'s editor panel (same as {@link openZzfxEditorPanel})
 * and, once its `zzfx/ready` handshake has resolved, pushes `zzfx/play` so
 * it plays immediately — the `playAtCursor` / CodeLens-with-a-real-finding
 * route. Reveals with `preserveFocus: true` regardless of whether the panel
 * was just created or already open: playing a sound shouldn't steal focus
 * away from the source editor the way an explicit "Edit" click should.
 */
export async function playInEditorPanel(
  context: vscode.ExtensionContext,
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string,
  params: number[]
): Promise<void> {
  await openZzfxEditorPanel(context, client, uri, findingId)
  const opened = openPanels.get(findingId)
  if (!opened) return // openZzfxEditorPanel already surfaced an error toast
  opened.panel.reveal(undefined, true)
  await opened.ready
  opened.bridge.emit('zzfx/play', { params })
}

/**
 * Plays `params` through whichever zzfx editor panel is already open, if
 * any — the fallback for `threeFlatland.audio.playParams` when invoked
 * without a `{ uri, findingId }` source (the CodeLens ▶ Play route always
 * supplies one; this only matters for a hypothetical bare invocation).
 * There is no real finding to back opening a fresh panel in this case, so
 * unlike {@link playInEditorPanel} this never creates one — returns
 * `false` when nothing is open for the caller to report that honestly
 * rather than silently no-op.
 */
export async function playInAnyOpenPanel(params: number[]): Promise<boolean> {
  const [first] = openPanels.values()
  if (!first) return false
  first.panel.reveal(undefined, true)
  await first.ready
  first.bridge.emit('zzfx/play', { params })
  return true
}
