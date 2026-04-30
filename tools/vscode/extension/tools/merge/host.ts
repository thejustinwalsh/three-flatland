import * as vscode from 'vscode'
import { posix as posixPath } from 'node:path'
import { createHostBridge } from '@three-flatland/bridge/host'
import { composeToolHtml, setupDevReload } from '../../webview-host'
import { log } from '../../log'
import { assertValidAtlas } from '../atlas/validateAtlas'
import type { AtlasJson } from '@three-flatland/io/atlas'

const TOOL = 'merge'

export async function openMergePanel(
  context: vscode.ExtensionContext,
  sidecarUris: vscode.Uri[]
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    'threeFlatland.merge',
    `Merge: ${sidecarUris.map((u) => labelFor(u)).join(', ')}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ...sidecarUris.map((u) => vscode.Uri.joinPath(u, '..')),
      ],
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

  const bridge = createHostBridge(panel.webview)

  bridge.on('merge/ready', async () => {
    log(`merge/ready (sources=${sidecarUris.length})`)
    const sources: Array<{
      uri: string
      imageUri: string
      alias: string
      json: unknown
    }> = []
    const errors: Array<{ uri: string; message: string }> = []
    const seen = new Set<string>()
    const dedupAlias = (raw: string): string => {
      if (!seen.has(raw)) {
        seen.add(raw)
        return raw
      }
      let i = 2
      while (seen.has(`${raw}_${i}`)) i++
      const next = `${raw}_${i}`
      seen.add(next)
      return next
    }
    for (const sidecar of sidecarUris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(sidecar)
        const text = new TextDecoder('utf-8').decode(bytes)
        const json = JSON.parse(text) as { meta?: { image?: string } }
        assertValidAtlas(json)
        const metaImage = json?.meta?.image
        if (typeof metaImage !== 'string' || metaImage.length === 0) {
          throw new Error('meta.image missing')
        }
        const imageUri = vscode.Uri.joinPath(sidecar, '..', metaImage)
        sources.push({
          uri: sidecar.toString(),
          imageUri: panel.webview.asWebviewUri(imageUri).toString(),
          alias: dedupAlias(labelFor(sidecar)),
          json,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ uri: sidecar.toString(), message })
      }
    }
    bridge.emit('merge/init', { sources, errors })
    return { ok: true }
  })

  bridge.on<{ level: string; args: unknown[] }>('client/log', ({ level, args }) => {
    log(`[webview:${level}]`, ...args)
    return { ok: true }
  })

  bridge.on<{
    pngBytes: number[]
    sidecar: unknown
    defaultName: string
    sourcesToDelete: string[]
  }>('merge/save', async ({ pngBytes, sidecar, defaultName, sourcesToDelete }) => {
    try {
      assertValidAtlas(sidecar)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Merged sidecar failed schema: ${msg}`)
    }
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(sidecarUris[0]!, '..', defaultName),
      filters: { Image: ['png'] },
      saveLabel: 'Save merged atlas',
    })
    if (!target) return { ok: false, cancelled: true }
    const stripped = target.path.replace(/\.png$/i, '')
    const pngPath = `${stripped}.png`
    const pngTarget = target.with({ path: pngPath })
    const sidecarUri = pngTarget.with({ path: `${stripped}.atlas.json` })
    ;(sidecar as { meta: { image: string } }).meta.image = pngPath.split('/').pop() ?? 'merged.png'
    relativizeMergeSources(sidecar as AtlasJson, sidecarUri)
    const png = new Uint8Array(pngBytes)
    const sidecarText = JSON.stringify(sidecar, null, 2) + '\n'
    await vscode.workspace.fs.writeFile(pngTarget, png)
    await vscode.workspace.fs.writeFile(sidecarUri, Buffer.from(sidecarText, 'utf8'))
    for (const uri of sourcesToDelete) {
      try {
        await vscode.workspace.fs.delete(vscode.Uri.parse(uri), { useTrash: true })
      } catch (err) {
        log(`merge/save: trash failed ${uri}: ${err instanceof Error ? err.message : err}`)
        // Best-effort; don't fail the whole save if a delete fails.
      }
    }
    return {
      ok: true,
      pngUri: pngTarget.toString(),
      sidecarUri: sidecarUri.toString(),
    }
  })

  bridge.on('dev/reload-request', async () => {
    panel.webview.html = await renderHtml()
    return { ok: true }
  })
  const disposeReload = setupDevReload(context.extensionUri, TOOL, () => {
    bridge.emit('dev/reload', { tool: TOOL })
  })

  panel.onDidDispose(() => {
    disposeReload.dispose()
    bridge.dispose()
  })
}

function relativizeMergeSources(sidecar: AtlasJson, anchorUri: vscode.Uri): void {
  const sources = sidecar.meta.merge?.sources
  if (!sources) return
  const anchorDir = posixPath.dirname(anchorUri.path)
  const anchorSegs = anchorDir.split('/').filter(Boolean)
  for (const s of sources) {
    let srcUri: vscode.Uri
    try {
      srcUri = vscode.Uri.parse(s.uri)
    } catch {
      continue
    }
    if (srcUri.scheme !== anchorUri.scheme || srcUri.authority !== anchorUri.authority) {
      s.uri = srcUri.toString()
      continue
    }
    const srcSegs = srcUri.path.split('/').filter(Boolean)
    let n = 0
    while (n < anchorSegs.length && n < srcSegs.length && anchorSegs[n] === srcSegs[n]) n++
    if (n === 0) {
      s.uri = srcUri.toString()
      continue
    }
    s.uri = posixPath.relative(anchorDir, srcUri.path)
  }
}

function labelFor(uri: vscode.Uri): string {
  const name = uri.path.split('/').pop() ?? uri.fsPath
  return name.replace(/\.atlas\.json$/, '')
}
