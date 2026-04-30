import * as vscode from 'vscode'
import { openMergePanel } from './host'

export function registerMergeTool(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'threeFlatland.merge.openMergeTool',
      // VSCode multi-select passes (clickedUri, allSelectedUris).
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        const uris = (allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : [])
          .filter((u) => u.path.endsWith('.atlas.json'))
        if (uris.length === 0) {
          void vscode.window.showErrorMessage(
            'FL Merge: select one or more .atlas.json files first.'
          )
          return
        }
        await openMergePanel(context, uris)
      }
    )
  )
}
