import * as vscode from 'vscode'

let channel: vscode.OutputChannel | null = null

export function getChannel(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('FL Tools')
  return channel
}

export function log(...parts: unknown[]): void {
  const ch = getChannel()
  const ts = new Date().toISOString().slice(11, 23)
  ch.appendLine(`[${ts}] ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`)
}
