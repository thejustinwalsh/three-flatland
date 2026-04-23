import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export type AtlasHtmlParams = {
  webview: vscode.Webview
  webviewDir: vscode.Uri
  cspSource: string
  initialPayload: { imageUri: string; fileName: string }
  log?: (msg: string) => void
}

/**
 * Compose the atlas webview HTML. Reads the Vite-produced index.html from
 * dist/webview/atlas/ and rewrites asset URLs to webview URIs, injects our
 * CSP + nonce + initial payload bootstrap.
 */
export async function composeAtlasHtml({
  webview,
  webviewDir,
  cspSource,
  initialPayload,
  log,
}: AtlasHtmlParams): Promise<string> {
  const indexUri = vscode.Uri.joinPath(webviewDir, 'index.html')
  let html: string
  try {
    html = await readFile(indexUri.fsPath, 'utf8')
    log?.(`read ${indexUri.fsPath} (${html.length} bytes)`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.(`FAILED to read ${indexUri.fsPath}: ${message}`)
    return placeholderHtml(
      `Webview bundle missing at ${indexUri.fsPath}. Run \`pnpm --filter @three-flatland/vscode build:webview\`.`
    )
  }

  const nonce = randomBytes(16).toString('hex')
  const base = webview.asWebviewUri(webviewDir).toString().replace(/\/?$/, '/')
  log?.(`base URI: ${base}`)

  // Rewrite every root-absolute src/href to a webview URI rooted at the
  // webviewDir. Vite builds with base: '/' by default so everything emits
  // as /assets/... or /chunks/...; we remap them wholesale.
  html = html.replace(/(src|href)="\/([^"]+)"/g, (_m, attr, path) => `${attr}="${base}${path}"`)

  // Strip crossorigin — it's a no-op for vscode-webview:// and sometimes
  // triggers odd resource-loading paths.
  html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '')

  // Add a nonce to every <script> tag (including any already-injected).
  html = html.replace(/<script\b((?:\s+[^>]*)?)>/g, (_m, attrs) => `<script nonce="${nonce}"${attrs ?? ''}>`)

  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} https: data: blob:`,
    `media-src ${cspSource} blob:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    // 'unsafe-eval' is required by three.js and @react-three/fiber internals
    // (Function-constructor shader string compilation, some uniform paths).
    // 'wasm-unsafe-eval' is required by WebGPU shader/module compilation.
    `script-src 'nonce-${nonce}' ${cspSource} 'wasm-unsafe-eval' 'unsafe-eval'`,
    `connect-src ${cspSource} blob: data:`,
    `worker-src ${cspSource} blob:`,
  ].join('; ')

  const bootstrap =
    `<script nonce="${nonce}">window.__FL_ATLAS__ = ${JSON.stringify(initialPayload)};</script>\n` +
    // Surface early runtime errors to the extension host via console.error.
    // Captured by the Webview Developer Tools; host can also sniff them
    // from webview stdout in rare cases.
    `<script nonce="${nonce}">
      window.addEventListener('error', (e) => {
        console.error('[FL Atlas] window.error:', e.message, e.filename + ':' + e.lineno);
      });
      window.addEventListener('unhandledrejection', (e) => {
        console.error('[FL Atlas] unhandledrejection:', e.reason && (e.reason.message || e.reason));
      });
    </script>`

  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`

  html = html.replace('<head>', `<head>\n${meta}\n${bootstrap}`)
  return html
}

function placeholderHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>FL Sprite Atlas</title></head>
<body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px;">
  <h2 style="margin:0 0 8px 0">FL Sprite Atlas</h2>
  <p style="color: var(--vscode-descriptionForeground);">${message}</p>
</body></html>`
}
