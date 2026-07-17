import * as vscode from 'vscode'
import { openMergePanel } from './host'
import { isToolEnabled } from '../../toolRegistry'

export function registerMergeTool(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand(
    'threeFlatland.merge.openMergeTool',
    // VSCode multi-select passes (clickedUri, allSelectedUris).
    async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
      // Defense in depth — see atlas/register.ts's identical guard comment.
      if (!isToolEnabled('atlasMerge')) {
        void vscode.window.showInformationMessage('FL Atlas Merge is disabled in Settings.')
        return
      }
      const uris = (allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : []).filter((u) =>
        u.path.endsWith('.atlas.json')
      )
      if (uris.length === 0) {
        void vscode.window.showErrorMessage('FL Merge: select one or more .atlas.json files first.')
        return
      }
      await openMergePanel(context, uris)
    }
  )
}
