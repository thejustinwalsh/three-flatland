import * as vscode from 'vscode'
import { AtlasCustomEditorProvider } from './provider'

export function registerAtlasTool(context: vscode.ExtensionContext): void {
  // CustomEditor: handles `vscode.openWith(uri, 'threeFlatland.atlas')` and
  // the "Reopen Editor With..." pathway.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      AtlasCustomEditorProvider.viewType,
      new AtlasCustomEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        // State survives via Zustand persist (webviewStorage + localStorage).
        webviewOptions: { retainContextWhenHidden: false },
      }
    )
  )

  // Explorer/palette command: opens the active resource in our CustomEditor.
  // Accepts either an image (foo.png) or its sidecar (foo.atlas.json) — when
  // invoked on a sidecar we resolve back to the associated image so the
  // editor opens on the right document.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.atlas.openEditor',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Sprite Atlas: no file selected.')
          return
        }
        const resolved = await resolveImageForCommand(target)
        if (!resolved) {
          const name = target.path.split('/').pop() ?? target.fsPath
          void vscode.window.showErrorMessage(
            `FL Sprite Atlas: no matching image found for ${name}.`,
          )
          return
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          resolved,
          AtlasCustomEditorProvider.viewType,
        )
      }
    )
  )
}

/**
 * Map a click target to the image URI the atlas editor should open.
 *
 * For a sidecar input (`foo.atlas.json`) the sidecar IS the source of
 * truth for which image it belongs to — `meta.sources[0].uri` carries the
 * source filename (relative to the sidecar's directory). We read the JSON,
 * resolve `meta.sources[0].uri` against the sidecar's parent dir, and open
 * that.
 *
 * Filename-pattern fallback (strip `.atlas.json`, try `.png`) only kicks
 * in when the sidecar is unreadable or its `meta.sources` is missing — so
 * a broken sidecar still has a chance of opening the right image, and a
 * renamed image is found via the sidecar's recorded name (not via the
 * sidecar filename, which may not match anymore).
 */
async function resolveImageForCommand(uri: vscode.Uri): Promise<vscode.Uri | null> {
  if (!uri.path.endsWith('.atlas.json')) return uri

  // Primary path: pick the first entry from meta.sources.
  try {
    const bytes = await vscode.workspace.fs.readFile(uri)
    const text = new TextDecoder().decode(bytes)
    const parsed: unknown = JSON.parse(text)
    const sourceUri = readMetaSourceUri(parsed)
    if (sourceUri) {
      const resolved = vscode.Uri.joinPath(uri, '..', sourceUri)
      const stat = await statSafe(resolved)
      if (stat?.type === vscode.FileType.File) return resolved
    }
  } catch {
    // Unreadable / unparseable — fall through to the filename pattern.
  }

  // Fallback: derive image filename from the sidecar's name.
  const base = uri.path.slice(0, -'.atlas.json'.length)
  // PNG only at v0; spec calls for WebP/AVIF/KTX2 in future passes.
  const exts = ['.png']
  for (const ext of exts) {
    const candidate = uri.with({ path: base + ext })
    const stat = await statSafe(candidate)
    if (stat?.type === vscode.FileType.File) return candidate
  }
  return null
}

function readMetaSourceUri(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null
  const meta = (parsed as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return null
  const sources = (meta as { sources?: unknown }).sources
  if (!Array.isArray(sources) || sources.length === 0) return null
  const first = sources[0] as { uri?: unknown }
  return typeof first.uri === 'string' && first.uri.length > 0 ? first.uri : null
}

async function statSafe(uri: vscode.Uri): Promise<vscode.FileStat | null> {
  try {
    return await vscode.workspace.fs.stat(uri)
  } catch {
    return null
  }
}
