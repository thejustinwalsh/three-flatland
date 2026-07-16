import type { ActivePlayback } from './activePlayback'

export type SourceEditorBindingDeps = {
  activePlayback: ActivePlayback
  /** The one stop path (register.ts's `stopActivePlayback`) — sidecar
   * stop + clear active. Injected so the binding's own decision logic
   * stays unit-testable without a real sidecar client or the `vscode`
   * module. */
  stop: () => void
  /** Whether any tab in any group still shows `uri` — register.ts backs
   * this with `vscode.window.tabGroups.all`; tests supply a fake. */
  isDocumentOpenInSomeTab: (uri: string) => boolean
}

export type SourceEditorBindingHandlers = {
  onDidChangeActiveTextEditor: (editorUri: string | undefined) => void
  onDidChangeTabs: () => void
  onDidCloseTextDocument: (closedUri: string) => void
}

/**
 * The source-editor-tab-binding decision logic (#46): a playing sound
 * belongs to its source document. Switching the active editor to a
 * DIFFERENT document, or closing the source document's tab, stops it. An
 * `undefined` active editor (focus moved to a terminal/panel/webview) is
 * deliberately not a switch — the sound keeps playing; the tab check is
 * what distinguishes "focus left the editor area" from "the source tab is
 * actually gone" (`onDidCloseTextDocument` alone can't carry the close
 * half: VS Code disposes `TextDocument`s lazily, so closing a tab is NOT
 * guaranteed to fire it, per its own API docs — proven live by the e2e
 * close test this replaces, where the event never arrived inside the
 * playback window).
 *
 * Extracted from register.ts's three `vscode.window`/`vscode.workspace`
 * listener registrations into pure, URI-based handlers so this wiring is
 * unit-testable (see sourceEditorBinding.test.ts) without the real
 * `vscode` module, which only resolves inside the extension host —
 * register.ts's own listeners just adapt the real events down to the
 * primitives these handlers take.
 */
export function createSourceEditorBindingHandlers(
  deps: SourceEditorBindingDeps
): SourceEditorBindingHandlers {
  const { activePlayback, stop, isDocumentOpenInSomeTab } = deps
  return {
    onDidChangeActiveTextEditor: (editorUri) => {
      const current = activePlayback.current
      if (!current || !editorUri) return
      if (editorUri === current.sourceUri) return
      stop()
    },
    onDidChangeTabs: () => {
      const current = activePlayback.current
      if (!current || isDocumentOpenInSomeTab(current.sourceUri)) return
      stop()
    },
    onDidCloseTextDocument: (closedUri) => {
      if (closedUri !== activePlayback.current?.sourceUri) return
      stop()
    },
  }
}
