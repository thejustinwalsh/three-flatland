import type { Disposable, Event, TabChangeEvent, TextDocument, TextEditor } from 'vscode'
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

/** The minimal set of real vscode event sources the binding subscribes to
 * — typed exactly as the real `vscode.window`/`vscode.workspace` members
 * so register.ts can pass them straight through with no wrapping, while a
 * test can inject fake emitters (see the "wiring" describe block in
 * sourceEditorBinding.test.ts) without importing the `vscode` module,
 * which only resolves inside the extension host. */
export type SourceEditorBindingEvents = {
  onDidChangeActiveTextEditor: Event<TextEditor | undefined>
  onDidChangeTabs: Event<TabChangeEvent>
  onDidCloseTextDocument: Event<TextDocument>
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
 * listener registrations into pure, URI-based handlers so the DECISION
 * logic is unit-testable (see sourceEditorBinding.test.ts) without the
 * real `vscode` module, which only resolves inside the extension host.
 * The WIRING half — subscribing the real events and adapting each
 * payload to the URI these handlers take — lives in
 * `registerSourceEditorBinding` below, so it too can be exercised with
 * fake event emitters instead of only via e2e.
 */
export function createSourceEditorBindingHandlers(deps: SourceEditorBindingDeps): SourceEditorBindingHandlers {
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

/**
 * The WIRING half of the source-editor-tab-binding feature: subscribes
 * the three real vscode events in `events` and adapts each payload down
 * to the URI string / no-arg calls `handlers` (from
 * `createSourceEditorBindingHandlers` above) expects, translating each
 * event to the CORRECT handler with the CORRECT URI:
 *
 * - `onDidChangeActiveTextEditor` → `handlers.onDidChangeActiveTextEditor(editor?.document.uri.toString())`
 * - `onDidChangeTabs` → `handlers.onDidChangeTabs()`
 * - `onDidCloseTextDocument` → `handlers.onDidCloseTextDocument(document.uri.toString())`
 *
 * Previously this adaptation was inlined at register.ts's three
 * `disposables.push(vscode.window...)` call sites, where deleting a
 * registration, wiring an event to the wrong handler, or deriving the
 * wrong URI would leave every handler-level test green — the handlers
 * themselves never see a mis-wired call. Extracting it here lets a test
 * inject fake event emitters (typed exactly as the real
 * `vscode.Event<T>` members so register.ts passes the real ones through
 * unchanged) and assert each fires the right handler with the right
 * argument — see the "wiring" describe block in
 * sourceEditorBinding.test.ts.
 */
export function registerSourceEditorBinding(
  events: SourceEditorBindingEvents,
  handlers: SourceEditorBindingHandlers
): Disposable {
  const subscriptions: Disposable[] = [
    events.onDidChangeActiveTextEditor((editor) =>
      handlers.onDidChangeActiveTextEditor(editor?.document.uri.toString())
    ),
    events.onDidChangeTabs(() => handlers.onDidChangeTabs()),
    events.onDidCloseTextDocument((document) => handlers.onDidCloseTextDocument(document.uri.toString())),
  ]
  return {
    dispose: () => {
      for (const subscription of subscriptions) subscription.dispose()
    },
  }
}
