import * as vscode from 'vscode'
import { openEncodePanel } from './host'

export function registerEncodeTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.encode.open',
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        const candidates = allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : []
        const target = candidates[0] ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Image Encoder: no file selected.')
          return
        }
        await openEncodePanel(context, target)
      },
    ),
  )
}
