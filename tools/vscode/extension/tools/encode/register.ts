import * as vscode from 'vscode'
import { EncodeCustomEditorProvider } from './host'

export function registerEncodeTool(context: vscode.ExtensionContext): void {
  // Register the custom editor provider.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      EncodeCustomEditorProvider.viewType,
      new EncodeCustomEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: false },
      },
    ),
  )

  // Keep the existing command as a thin wrapper. Lets the explorer/context
  // menu and palette continue working — they invoke this command.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.encode.open',
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        const candidates =
          allSelected && allSelected.length > 0
            ? allSelected
            : clicked
              ? [clicked]
              : []
        const target = candidates[0] ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Image Encoder: no file selected.')
          return
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          EncodeCustomEditorProvider.viewType,
        )
      },
    ),
  )
}
