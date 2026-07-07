// Opens/focuses the FL ZzFX Studio editor webview (webview/zzfx/) for one
// finding. Wires the full bridge contract documented in
// webview/zzfx/README.md — this file is exactly the "What Z3 needs to add"
// snippet from that doc, plus the rest of the panel-lifecycle boilerplate
// every tool follows (composeToolHtml, dev-reload, client/log).
import * as vscode from 'vscode'
import { createHostBridge, type HostBridge } from '@three-flatland/bridge/host'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'
import { PRESET_LIBRARY } from './lm/core'
import { ZzfxLmService } from './lm/service'
import { resolveParams } from './resolveParams'

const TOOL = 'zzfx'

type ZzfxGeneratePayload = { category: string; styles: string[]; n: number }
type ZzfxSavePayload = { findingId: string; params: number[]; category?: string; styles?: string[] }

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
): Promise<{ document: vscode.TextDocument; finding: Finding } | undefined> {
  const document = await vscode.workspace.openTextDocument(uri)
  const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
  const finding = findings.find((f) => f.id === findingId)
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
): Promise<{ document: vscode.TextDocument; finding: Finding } | undefined> {
  for (let attempt = 0; attempt < SAVE_RESOLVE_MAX_ATTEMPTS; attempt++) {
    const document = await vscode.workspace.openTextDocument(uri)
    const versionAtParse = document.version
    const { findings } = await client.parse({ uri: uri.toString(), text: document.getText() })
    if (document.version !== versionAtParse) continue
    const finding = findings.find((f) => f.id === findingId)
    if (!finding) return undefined
    return { document, finding }
  }
  return undefined
}

function rangeFromWire(range: Finding['range']): vscode.Range {
  return new vscode.Range(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character
  )
}

export async function openZzfxEditorPanel(
  context: vscode.ExtensionContext,
  client: CodelensServiceClient,
  uri: vscode.Uri,
  findingId: string
): Promise<void> {
  const resolved = await resolveFinding(client, uri, findingId)
  if (!resolved) {
    void vscode.window.showErrorMessage(
      'FL ZzFX: this zzfx() call could not be found — the source may have changed.'
    )
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

  bridge.on('zzfx/ready', async () => {
    log(`zzfx/ready for finding ${findingId}`)
    // For a variable-spread call, payload.params is genuinely empty — the
    // resolved values live only in the declaration's source text. Resolve
    // before sending init so the sliders start at NAME's actual values,
    // not all-defaults.
    const params = await resolveParams(finding)
    bridge.emit('zzfx/init', {
      findingId,
      uri: uri.toString(),
      params,
      varRef: finding.payload.varRef,
      lmAvailable: await lmService.isAvailable(),
      presets: PRESET_LIBRARY,
    })
    resolveReady()
    return { ok: true }
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
    return { ok: true }
  })

  bridge.on<ZzfxSavePayload>('zzfx/save', async ({ findingId: fid, params }) => {
    const current = await resolveFindingForSave(client, uri, fid)
    if (!current) {
      throw new Error(
        'This zzfx() call could not be found — the source may have changed since the panel opened.'
      )
    }
    const { document, finding: currentFinding } = current
    const edit = new vscode.WorkspaceEdit()
    const varRef = currentFinding.payload.varRef
    if (varRef?.defRange && varRef.defUri) {
      // Variable case: rewrite the declaration's VALUE (the array
      // literal), not the call site's `...VARNAME` spread — matches
      // planning doc: "edit the variable's value range."
      edit.replace(
        vscode.Uri.parse(varRef.defUri),
        rangeFromWire(varRef.defRange),
        `[${params.join(', ')}]`
      )
    } else {
      edit.replace(document.uri, rangeFromWire(currentFinding.payload.argRange), params.join(', '))
    }
    const applied = await vscode.workspace.applyEdit(edit)
    if (!applied) throw new Error('Failed to apply the edit — the document may be read-only.')
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  const disposeReload = setupDevReload(context.extensionUri, TOOL, () =>
    bridge.emit('dev/reload', { tool: TOOL })
  )
  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })

  panel.onDidDispose(() => {
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
 * any — the fallback for `threeFlatland.zzfx.playParams` when invoked
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
