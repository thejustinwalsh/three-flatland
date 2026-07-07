import * as vscode from 'vscode'
import { EncodeCustomEditorProvider, openEncodePanel } from './host'
import { isToolEnabled } from '../../toolRegistry'

export function registerEncodeTool(context: vscode.ExtensionContext): vscode.Disposable {
  const disposables: vscode.Disposable[] = []

  // Register the custom editor for *.ktx2 (priority "default" in
  // package.json so double-clicking a KTX2 file opens our viewer in
  // inspect mode). PNG/WebP/AVIF have no customEditor entry — they
  // open in VSCode's built-in image preview.
  disposables.push(
    vscode.window.registerCustomEditorProvider(
      EncodeCustomEditorProvider.viewType,
      new EncodeCustomEditorProvider(context),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: { retainContextWhenHidden: false },
      }
    )
  )

  // Right-click "Open Image Encoder" — bypasses the customEditor so the
  // selected file always loads in encode mode (KTX2 sources decode to
  // RGBA on the webview side via the Ktx2Loader RGBA32 fallback).
  disposables.push(
    vscode.commands.registerCommand(
      'threeFlatland.encode.open',
      async (clicked?: vscode.Uri, allSelected?: vscode.Uri[]) => {
        // Defense in depth — see atlas/register.ts's identical guard comment.
        if (!isToolEnabled('imageEncoder')) {
          void vscode.window.showInformationMessage('FL Image Encoder is disabled in Settings.')
          return
        }
        const candidates =
          allSelected && allSelected.length > 0 ? allSelected : clicked ? [clicked] : []
        const target = candidates[0] ?? vscode.window.activeTextEditor?.document.uri
        if (!target) {
          void vscode.window.showErrorMessage('FL Image Encoder: no file selected.')
          return
        }
        await openEncodePanel(context, target)
      }
    )
  )

  return vscode.Disposable.from(...disposables)
}
