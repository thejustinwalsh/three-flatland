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
        webviewOptions: { retainContextWhenHidden: false },
      }
    )
  )

  // Explorer/palette command: opens the active resource in our CustomEditor.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.atlas.openEditor',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Sprite Atlas: no file selected.')
          return
        }
        await vscode.commands.executeCommand('vscode.openWith', target, AtlasCustomEditorProvider.viewType)
      }
    )
  )
}
