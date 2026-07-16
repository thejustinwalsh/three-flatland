import type { Disposable, Event, TabChangeEvent, TextDocument, TextEditor } from 'vscode'
import { describe, expect, it, vi } from 'vitest'
import { ActivePlayback } from './activePlayback'
import {
  createSourceEditorBindingHandlers,
  registerSourceEditorBinding,
  type SourceEditorBindingEvents,
  type SourceEditorBindingHandlers,
} from './sourceEditorBinding'

const SOURCE_A = { findingId: 'f1', sourceUri: 'file:///a.ts' }
const SOURCE_B = { findingId: 'f2', sourceUri: 'file:///b.ts' }

/**
 * Mirrors register.ts's actual `stopActivePlayback` — sidecar stop, then
 * clear active — so a passing assertion here means the same shape of
 * effect production code produces, not a test-only re-implementation.
 * `fakeClient` stands in for the audio-play sidecar's `PlaySidecarClient`.
 */
function makeStopSpy() {
  const fakeClient = { stopSong: vi.fn() }
  const activePlayback = new ActivePlayback(() => {})
  const stop = (): void => {
    fakeClient.stopSong()
    activePlayback.clear()
  }
  return { fakeClient, activePlayback, stop }
}

describe('createSourceEditorBindingHandlers — onDidChangeActiveTextEditor', () => {
  it('switching the active editor to a DIFFERENT document stops the correlated sidecar playback (#46 phase 1)', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidChangeActiveTextEditor(SOURCE_B.sourceUri)

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })

  it('switching the active editor to the SAME source document does not stop playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidChangeActiveTextEditor(SOURCE_A.sourceUri)

    expect(fakeClient.stopSong).not.toHaveBeenCalled()
    expect(activePlayback.current).toEqual(SOURCE_A)
  })

  it('an undefined active editor (focus left the editor area) does not stop playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidChangeActiveTextEditor(undefined)

    expect(fakeClient.stopSong).not.toHaveBeenCalled()
    expect(activePlayback.current).toEqual(SOURCE_A)
  })

  it('with no active playback, switching editors is a no-op', () => {
    const { fakeClient, stop, activePlayback } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    handlers.onDidChangeActiveTextEditor(SOURCE_B.sourceUri)

    expect(fakeClient.stopSong).not.toHaveBeenCalled()
  })
})

describe('createSourceEditorBindingHandlers — onDidChangeTabs', () => {
  it('a tab-group change where the source document is no longer open in ANY tab stops playback (#46 phase 2)', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const isDocumentOpenInSomeTab = vi.fn(() => false)
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidChangeTabs()

    expect(isDocumentOpenInSomeTab).toHaveBeenCalledWith(SOURCE_A.sourceUri)
    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })

  it('a tab-group change where the source document is still open elsewhere does not stop playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidChangeTabs()

    expect(fakeClient.stopSong).not.toHaveBeenCalled()
  })

  it('with no active playback, a tab-group change is a no-op (and never consults isDocumentOpenInSomeTab)', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const isDocumentOpenInSomeTab = vi.fn(() => false)
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab,
    })

    handlers.onDidChangeTabs()

    expect(isDocumentOpenInSomeTab).not.toHaveBeenCalled()
    expect(fakeClient.stopSong).not.toHaveBeenCalled()
  })
})

describe('createSourceEditorBindingHandlers — onDidCloseTextDocument', () => {
  it('closing the source document stops playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidCloseTextDocument(SOURCE_A.sourceUri)

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })

  it('closing an UNRELATED document does not stop playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    activePlayback.set(SOURCE_A)
    handlers.onDidCloseTextDocument(SOURCE_B.sourceUri)

    expect(fakeClient.stopSong).not.toHaveBeenCalled()
    expect(activePlayback.current).toEqual(SOURCE_A)
  })
})

describe('createSourceEditorBindingHandlers — cross-talk / correlation', () => {
  it('a stale close for a superseded source does not stop the NEW active playback', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const handlers = createSourceEditorBindingHandlers({
      activePlayback,
      stop,
      isDocumentOpenInSomeTab: () => true,
    })

    // A stops via the switch listener, B starts playing from the newly
    // active document — then A's now-irrelevant tab finally closes.
    activePlayback.set(SOURCE_A)
    handlers.onDidChangeActiveTextEditor(SOURCE_B.sourceUri)
    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)

    activePlayback.set(SOURCE_B)
    handlers.onDidCloseTextDocument(SOURCE_A.sourceUri)

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1) // no second, unrelated stop
    expect(activePlayback.current).toEqual(SOURCE_B)
  })
})

/**
 * Coverage for `registerSourceEditorBinding` — the WIRING half register.ts
 * delegates to (finding #4, planning/testing/pr188-adversarial-review.md).
 * The suites above only ever call the pure handlers directly; they can't
 * catch a deleted registration, an event wired to the wrong handler, or a
 * URI derived incorrectly, because register.ts's real `vscode.window`/
 * `vscode.workspace` event objects never appear in them. These fakes are
 * typed exactly as `SourceEditorBindingEvents` (== the real
 * `vscode.Event<T>` member types) so `fire()` below drives the SAME
 * `registerSourceEditorBinding` code path register.ts wires the real
 * events through.
 */
function fakeEvent<T>(): {
  event: Event<T>
  fire: (arg: T) => void
  disposeCount: number
} {
  let listener: ((arg: T) => void) | undefined
  let disposeCount = 0
  const event = ((listenerArg: (arg: T) => void): Disposable => {
    listener = listenerArg
    return { dispose: () => void disposeCount++ }
  }) as Event<T>
  return {
    event,
    fire: (arg: T) => listener?.(arg),
    get disposeCount() {
      return disposeCount
    },
  }
}

function makeFakeEvents(): {
  events: SourceEditorBindingEvents
  activeEditor: ReturnType<typeof fakeEvent<TextEditor | undefined>>
  tabs: ReturnType<typeof fakeEvent<TabChangeEvent>>
  closeDoc: ReturnType<typeof fakeEvent<TextDocument>>
} {
  const activeEditor = fakeEvent<TextEditor | undefined>()
  const tabs = fakeEvent<TabChangeEvent>()
  const closeDoc = fakeEvent<TextDocument>()
  return {
    events: {
      onDidChangeActiveTextEditor: activeEditor.event,
      onDidChangeTabs: tabs.event,
      onDidCloseTextDocument: closeDoc.event,
    },
    activeEditor,
    tabs,
    closeDoc,
  }
}

function fakeTextEditor(uri: string): TextEditor {
  return { document: { uri: { toString: () => uri } } } as unknown as TextEditor
}

function fakeTextDocument(uri: string): TextDocument {
  return { uri: { toString: () => uri } } as unknown as TextDocument
}

function makeHandlerSpies(): SourceEditorBindingHandlers {
  return {
    onDidChangeActiveTextEditor: vi.fn(),
    onDidChangeTabs: vi.fn(),
    onDidCloseTextDocument: vi.fn(),
  }
}

describe('registerSourceEditorBinding — wiring', () => {
  it('wires onDidChangeActiveTextEditor to the correct handler with the correct URI, and no other handler', () => {
    const { events, activeEditor } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    registerSourceEditorBinding(events, handlers)

    activeEditor.fire(fakeTextEditor(SOURCE_A.sourceUri))
    activeEditor.fire(fakeTextEditor(SOURCE_B.sourceUri))

    expect(handlers.onDidChangeActiveTextEditor).toHaveBeenNthCalledWith(1, SOURCE_A.sourceUri)
    expect(handlers.onDidChangeActiveTextEditor).toHaveBeenNthCalledWith(2, SOURCE_B.sourceUri)
    expect(handlers.onDidChangeTabs).not.toHaveBeenCalled()
    expect(handlers.onDidCloseTextDocument).not.toHaveBeenCalled()
  })

  it('derives undefined (not a stringified object, not a stale value) when the active editor event fires with no editor', () => {
    const { events, activeEditor } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    registerSourceEditorBinding(events, handlers)

    activeEditor.fire(undefined)

    expect(handlers.onDidChangeActiveTextEditor).toHaveBeenCalledWith(undefined)
  })

  it('wires onDidChangeTabs to the correct handler, and no other handler', () => {
    const { events, tabs } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    registerSourceEditorBinding(events, handlers)

    tabs.fire({} as TabChangeEvent)

    expect(handlers.onDidChangeTabs).toHaveBeenCalledTimes(1)
    expect(handlers.onDidChangeActiveTextEditor).not.toHaveBeenCalled()
    expect(handlers.onDidCloseTextDocument).not.toHaveBeenCalled()
  })

  it('wires onDidCloseTextDocument to the correct handler with the correct URI, and no other handler', () => {
    const { events, closeDoc } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    registerSourceEditorBinding(events, handlers)

    closeDoc.fire(fakeTextDocument(SOURCE_A.sourceUri))
    closeDoc.fire(fakeTextDocument(SOURCE_B.sourceUri))

    expect(handlers.onDidCloseTextDocument).toHaveBeenNthCalledWith(1, SOURCE_A.sourceUri)
    expect(handlers.onDidCloseTextDocument).toHaveBeenNthCalledWith(2, SOURCE_B.sourceUri)
    expect(handlers.onDidChangeActiveTextEditor).not.toHaveBeenCalled()
    expect(handlers.onDidChangeTabs).not.toHaveBeenCalled()
  })

  it('registers all three subscriptions — a missing registration would leave that event a permanent no-op', () => {
    const { events, activeEditor, tabs, closeDoc } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    registerSourceEditorBinding(events, handlers)

    activeEditor.fire(fakeTextEditor(SOURCE_A.sourceUri))
    tabs.fire({} as TabChangeEvent)
    closeDoc.fire(fakeTextDocument(SOURCE_A.sourceUri))

    expect(handlers.onDidChangeActiveTextEditor).toHaveBeenCalledTimes(1)
    expect(handlers.onDidChangeTabs).toHaveBeenCalledTimes(1)
    expect(handlers.onDidCloseTextDocument).toHaveBeenCalledTimes(1)
  })

  it('disposing the returned Disposable disposes all three underlying event subscriptions', () => {
    const { events, activeEditor, tabs, closeDoc } = makeFakeEvents()
    const handlers = makeHandlerSpies()
    const disposable = registerSourceEditorBinding(events, handlers)

    disposable.dispose()

    expect(activeEditor.disposeCount).toBe(1)
    expect(tabs.disposeCount).toBe(1)
    expect(closeDoc.disposeCount).toBe(1)
  })
})

describe('registerSourceEditorBinding — end-to-end correlated stop', () => {
  it('switching the active editor away from the bound source stops the correlated sidecar playback through the real wiring', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const { events, activeEditor } = makeFakeEvents()
    registerSourceEditorBinding(
      events,
      createSourceEditorBindingHandlers({
        activePlayback,
        stop,
        isDocumentOpenInSomeTab: () => true,
      })
    )

    activePlayback.set(SOURCE_A)
    activeEditor.fire(fakeTextEditor(SOURCE_B.sourceUri))

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })

  it('closing the bound source tab stops the correlated sidecar playback through the real wiring', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const { events, closeDoc } = makeFakeEvents()
    registerSourceEditorBinding(
      events,
      createSourceEditorBindingHandlers({
        activePlayback,
        stop,
        isDocumentOpenInSomeTab: () => true,
      })
    )

    activePlayback.set(SOURCE_A)
    closeDoc.fire(fakeTextDocument(SOURCE_A.sourceUri))

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })

  it('a tab-group change where the bound source closed elsewhere (not covered by the other two events) stops it through the real wiring', () => {
    const { fakeClient, activePlayback, stop } = makeStopSpy()
    const { events, tabs } = makeFakeEvents()
    registerSourceEditorBinding(
      events,
      createSourceEditorBindingHandlers({
        activePlayback,
        stop,
        isDocumentOpenInSomeTab: () => false,
      })
    )

    activePlayback.set(SOURCE_A)
    tabs.fire({} as TabChangeEvent)

    expect(fakeClient.stopSong).toHaveBeenCalledTimes(1)
    expect(activePlayback.current).toBeUndefined()
  })
})
