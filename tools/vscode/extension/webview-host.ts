import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'

export type ComposeHtmlParams = {
  webview: vscode.Webview
  /** Tool name — matches the `webview/<tool>/` subdir under the package root. */
  tool: string
  extensionUri: vscode.Uri
  /** Optional HTML snippet injected at the top of <head>. */
  injectCode?: string
}

/**
 * Read the built `dist/webview/<tool>/index.html`, substitute the %FL_BASE%
 * token (emitted by our Vite plugin) with the panel's webview cdn URI,
 * inject CSP meta + nonce + optional bootstrap code. No iframes — the
 * webview runs natively at vscode-webview:// so asWebviewUri() URIs,
 * workspace resources, and codicon fonts all resolve the normal way.
 */
export async function composeToolHtml(params: ComposeHtmlParams): Promise<string> {
  const { webview, tool, extensionUri, injectCode } = params
  const toolDir = vscode.Uri.joinPath(extensionUri, 'dist', 'webview', tool)
  const htmlUri = vscode.Uri.joinPath(toolDir, 'index.html')

  let html: string
  try {
    html = await readFile(htmlUri.fsPath, 'utf8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return placeholderHtml(
      `Webview bundle missing at ${htmlUri.fsPath}. Run \`pnpm --filter @three-flatland/vscode build\`. (${msg})`
    )
  }

  const nonce = randomBytes(16).toString('hex')
  // Base is the SHARED webview root (dist/webview/), not the per-tool dir —
  // Vite emits `../assets/…` from tool subdirs to a shared assets/ folder,
  // so tokens need to resolve against the parent.
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const base = webview.asWebviewUri(webviewRoot).toString().replace(/\/?$/, '/')

  // Substitute the asset-URL token our Vite plugin emitted.
  html = html.split('%FL_BASE%').join(base)

  // Drop Vite-emitted `crossorigin` — no-op on vscode-webview:// and can
  // trigger odd resource-loading paths in some webview versions.
  html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '')

  // Nonceify injectCode's <script> tags BEFORE stamping the HTML's own
  // <script> tags so we only do one regex pass that covers both.
  const noncedInject = (injectCode ?? '').replace(
    /<script\b((?:\s+[^>]*)?)>/g,
    (_m, attrs) => `<script nonce="${nonce}"${attrs ?? ''}>`
  )

  // Add nonce to every <script> tag in the Vite-emitted HTML.
  html = html.replace(/<script\b((?:\s+[^>]*)?)>/g, (_m, attrs) => `<script nonce="${nonce}"${attrs ?? ''}>`)

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data: blob:`,
    `media-src ${webview.cspSource} blob:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval' 'unsafe-eval'`,
    `connect-src ${webview.cspSource} blob: data:`,
    `worker-src ${webview.cspSource} blob:`,
  ].join('; ')

  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  html = html.replace('<head>', `<head>\n${meta}\n${noncedInject}`)

  return html
}

function placeholderHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FL Tools</title></head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px;">
  <h2 style="margin:0 0 8px 0">FL Tools</h2>
  <p style="color: var(--vscode-descriptionForeground);">${message}</p>
</body></html>`
}

/**
 * Watch the whole `dist/webview/` tree for changes and emit a `dev/reload`
 * notification so the webview can show its "Reload" toast. We need the
 * whole tree (not just the per-tool subdir) because Vite emits:
 *
 *   dist/webview/<tool>/index.html          ← thin HTML referencing hashed assets
 *   dist/webview/assets/<tool>-HASH.js      ← real bundle, shared asset dir
 *   dist/webview/assets/<tool>-HASH.css
 *
 * Watching only `<tool>/` means we'd see `index.html` regenerate but
 * sometimes miss the event (fs.watch + atomic rename on macOS is flaky),
 * and we wouldn't see the asset files that actually carry the change.
 * Watching the shared parent picks up all of it.
 *
 * Debounced to one reload per burst of writes. Safe no-op if the root
 * doesn't exist yet (pre-first-build).
 */
export function setupDevReload(
  extensionUri: vscode.Uri,
  _tool: string,
  onReload: () => void,
  debounceMs = 150
): vscode.Disposable {
  const root = vscode.Uri.joinPath(extensionUri, 'dist', 'webview').fsPath
  let watcher: FSWatcher | null = null
  let t: NodeJS.Timeout | null = null

  try {
    watcher = watch(root, { recursive: true }, () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        t = null
        onReload()
      }, debounceMs)
    })
  } catch {
    // Directory doesn't exist yet.
  }

  return {
    dispose: () => {
      if (t) clearTimeout(t)
      watcher?.close()
    },
  }
}
