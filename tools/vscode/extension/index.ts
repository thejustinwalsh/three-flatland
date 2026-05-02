import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register'
import { registerMergeTool } from './tools/merge/register'
import { registerEncodeTool } from './tools/encode/register'
import { registerWasmTest } from './tools/_wasm-test/register'
import { getChannel, log } from './log'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(getChannel())
  log('activate: @three-flatland/vscode')
  registerAtlasTool(context)
  registerMergeTool(context)
  registerEncodeTool(context)
  registerWasmTest(context)
  log(`activate: extensionUri = ${context.extensionUri.fsPath}`)
}

export function deactivate(): void {
  log('deactivate')
}
