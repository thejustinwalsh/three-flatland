import * as vscode from 'vscode'
import { createHostBridge } from '@three-flatland/bridge/host'
import type { NormalSourceDescriptor } from '@three-flatland/normals/node'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'
import { readNormalDescriptorSidecar, saveNormalDescriptor } from './sidecar'

const TOOL = 'normal-baker'

export async function openNormalBakerPanel(context: vscode.ExtensionContext, imageUri: vscode.Uri): Promise<void> {
  const fileName = imageUri.path.split('/').pop() ?? 'image.png'

  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.normalBaker',
    `Normal Baker: ${fileName}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      // State survives via Zustand persist (webviewStorage + localStorage) —
      // see webview/normal-baker/normalBakerStore.ts.
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist'), vscode.Uri.joinPath(imageUri, '..')],
    }
  )

  const renderHtml = async () =>
    composeToolHtml({
      webview: panel.webview,
      tool: TOOL,
      extensionUri: context.extensionUri,
      injectCode: '',
    })
  panel.webview.html = await renderHtml()

  // One bridge lives across re-renders — see atlas/provider.ts's identical
  // comment for why (panel.webview.html reassignment on dev/reload-request
  // doesn't tear down panel.webview's onDidReceiveMessage subscription).
  const bridge = createHostBridge(panel.webview)

  bridge.on('normalBaker/ready', async () => {
    log(`normalBaker/ready: ${imageUri.fsPath}`)
    let descriptor: NormalSourceDescriptor | null = null
    let loadError: string | null = null
    try {
      const loaded = await readNormalDescriptorSidecar(imageUri)
      if (loaded) {
        descriptor = loaded.descriptor
        log(`normalBaker/ready loaded existing descriptor (${loaded.descriptor.regions?.length ?? 0} region(s))`)
      } else {
        log('normalBaker/ready no existing sidecar')
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err)
      log(`normalBaker/ready sidecar load failed: ${loadError}`)
    }
    bridge.emit('normalBaker/init', {
      uri: panel.webview.asWebviewUri(imageUri).toString(),
      fileName,
      descriptor,
      loadError,
    })
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  // normalBaker/save: bake to <source>.normal.png (Node fs, direct — see
  // sidecar.ts's saveNormalDescriptor) and write <source>.normal.json.
  // Both derive from the same `descriptor` value the webview sent, so the
  // PNG's stamped content hash and the JSON sidecar never disagree.
  bridge.on<{
    descriptor: NormalSourceDescriptor
    options: Record<string, never>
  }>('normalBaker/save', async ({ descriptor }) => {
    try {
      const { pngUri, jsonUri } = saveNormalDescriptor(imageUri, descriptor)
      log(`normalBaker/save wrote ${pngUri.fsPath} + ${jsonUri.fsPath}`)
      return { ok: true, sidecarUri: jsonUri.toString(), pngUri: pngUri.toString() }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`normalBaker/save failed: ${msg}`)
      throw new Error(msg)
    }
  })

  // Ad-hoc webview panel (not a CustomDocument) — there's no built-in
  // "unsaved changes" tab indicator to drive here; that mechanism only
  // exists for the customEditors pattern (see tools/vscode/AGENTS.md "Two
  // patterns: custom editor vs ad-hoc command"). Acknowledge so the
  // webview's best-effort request doesn't hang; nothing else to do today.
  bridge.on<{ isDirty: boolean }>('normalBaker/dirty', async () => {
    return { ok: true }
  })

  // Toast "Reload" click → re-render the HTML from disk (see atlas
  // provider.ts's identical comment for why reassigning webview.html,
  // not location.reload(), is the supported re-render path).
  bridge.on('dev/reload-request', async () => {
    log('dev/reload-request → re-rendering webview.html')
    panel.webview.html = await renderHtml()
    return { ok: true }
  })
  const disposeReload = setupDevReload(context.extensionUri, TOOL, () => {
    log('dev/reload → notifying webview (opt-in reload)')
    bridge.emit('dev/reload', { tool: TOOL })
  })

  panel.onDidDispose(() => {
    log(`panel disposed: ${imageUri.fsPath}`)
    disposeReload.dispose()
    bridge.dispose()
  })
}
