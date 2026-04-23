import * as vscode from 'vscode'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export type AtlasHtmlParams = {
  webview: vscode.Webview
  webviewDir: vscode.Uri
  cspSource: string
  initialPayload: { imageUri: string; fileName: string }
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
}: AtlasHtmlParams): Promise<string> {
  const indexUri = vscode.Uri.joinPath(webviewDir, 'index.html')
  let html: string
  try {
    html = await readFile(indexUri.fsPath, 'utf8')
  } catch {
    return placeholderHtml('Webview bundle missing — run `pnpm --filter @three-flatland/vscode build:webview`.')
  }

  const nonce = randomBytes(16).toString('hex')
  const base = webview.asWebviewUri(webviewDir).toString().replace(/\/?$/, '/')

  // Rewrite root-relative asset URLs (Vite emits /assets/... and /chunks/...)
  // to webview URIs rooted at the atlas webview directory.
  html = html.replace(/(src|href)="\/?((?:assets|chunks|index\.js|atlas)[^"]*)"/g, (_m, attr, p) => `${attr}="${base}${p}"`)

  // Swap <script src> tags to include the nonce.
  html = html.replace(/<script\b([^>]*)>/g, (_m, attrs) => `<script nonce="${nonce}"${attrs}>`)

  const csp = [
    `default-src 'none'`,
    `img-src ${cspSource} https: data: blob:`,
    `media-src ${cspSource} blob:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    `connect-src ${cspSource} blob:`,
  ].join('; ')

  const bootstrap = `<script nonce="${nonce}">window.__FL_ATLAS__ = ${JSON.stringify(initialPayload)};</script>`
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
