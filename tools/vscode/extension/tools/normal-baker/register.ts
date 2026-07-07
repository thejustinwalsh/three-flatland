import * as vscode from 'vscode'
import { openNormalBakerPanel } from './host'

export function registerNormalBakerTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.normalBaker.open',
      async (clicked?: vscode.Uri) => {
        const target = clicked ?? vscode.window.activeTextEditor?.document.uri
        if (!target || !target.path.toLowerCase().endsWith('.png')) {
          void vscode.window.showErrorMessage('FL Normal Baker: select a PNG file first.')
          return
        }
        await openNormalBakerPanel(context, target)
      }
    )
  )
}
