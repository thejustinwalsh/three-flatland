import * as vscode from 'vscode'
import { registerAtlasTool } from './tools/atlas/register.js'

export function activate(context: vscode.ExtensionContext): void {
  registerAtlasTool(context)
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
