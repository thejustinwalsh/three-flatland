import { describe, expect, it, vi } from 'vitest'
import { ActivePlayback } from './activePlayback'
import { createSourceEditorBindingHandlers } from './sourceEditorBinding'

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
