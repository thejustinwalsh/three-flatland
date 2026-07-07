import * as vscode from 'vscode'
import type { CodelensServiceClient, Finding } from '@three-flatland/codelens-service'
import { getSidecarClient, shutdownSidecar } from './sidecarManager'
import { ZzfxCodeLensProvider, ZZFX_DOCUMENT_SELECTOR } from './provider'
import { openZzfxEditorPanel, playInAnyOpenPanel, playInEditorPanel } from './host'
import { resolveParams } from './resolveParams'

function findFindingAtPosition(
  findings: readonly Finding[],
  position: vscode.Position
): Finding | undefined {
  return findings.find((f) => {
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
): Promise<{ uri: vscode.Uri; finding: Finding } | undefined> {
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

export function registerZzfxTool(context: vscode.ExtensionContext): void {
  const provider = new ZzfxCodeLensProvider(() => getSidecarClient(context))
  context.subscriptions.push(
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
  context.subscriptions.push(
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
  // `source`, when supplied (the CodeLens always supplies it — see
  // provider.ts), carries the real finding this play request is for, so
  // it can open/reuse that finding's own editor panel to play through
  // rather than needing a synthetic one.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.zzfx.playParams',
      async (params: number[], source?: { uri: string; findingId: string }) => {
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

  context.subscriptions.push(
    vscode.commands.registerCommand('threeFlatland.zzfx.playAtCursor', async () => {
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
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.zzfx.openEditor',
      async (arg?: { uri: string; findingId: string }) => {
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

  context.subscriptions.push({ dispose: () => void shutdownSidecar() })
}
