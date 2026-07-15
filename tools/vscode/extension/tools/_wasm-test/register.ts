import * as vscode from 'vscode'
import { composeToolHtml } from '../../webview-host'

export function registerWasmTest(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('threeFlatland.wasmTest.open', async () => {
      const panel = vscode.window.createWebviewPanel(
        'threeFlatland.wasmTest',
        'WASM Contract Test',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: false,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
        },
      )
      panel.webview.html = await composeToolHtml({
        webview: panel.webview,
        tool: '_wasm-test',
        extensionUri: context.extensionUri,
      })
    }),
  )
}
