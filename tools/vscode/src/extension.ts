import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register.js'
import { getChannel, log } from './log.js'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(getChannel())
  log('activate: @three-flatland/vscode')
  registerAtlasTool(context)
  log(`activate: extensionUri = ${context.extensionUri.fsPath}`)
}

export function deactivate(): void {
  log('deactivate')
}
