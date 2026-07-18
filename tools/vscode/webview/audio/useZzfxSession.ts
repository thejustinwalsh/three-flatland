import { useCallback, useEffect, useRef, useState } from 'react'
import { createClientBridge, type ClientBridge } from '@three-flatland/bridge/client'
import { defaultParams, fromArgs, toArgs, clampParam, type ParamKey, type ZzfxParams } from './params'
import type {
  ZzfxCandidate,
  ZzfxConfigEvent,
  ZzfxGenerateAck,
  ZzfxGeneratePayload,
  ZzfxGenerateProgressEvent,
  ZzfxGenerateResultEvent,
  ZzfxHistoryBatch,
  ZzfxHistoryChangedEvent,
  ZzfxHistoryDeletePayload,
  ZzfxHistoryDeleteResult,
  ZzfxInitPayload,
  ZzfxPlayEvent,
  ZzfxSavePayload,
  ZzfxSaveResult,
} from './protocol'

export const DEFAULT_CANDIDATE_COUNT = 4

export type ZzfxSessionState = {
  /** True when `acquireVsCodeApi()` isn't available — dev/standalone run
   * outside a VSCode webview host. Params stay at their defaults, Save
   * and Generate are both no-ops (Generate requires the bridge — even
   * the preset-browsing fallback needs `presets` from the host's init
   * payload), Play still works (it's pure Web Audio). */
  standalone: boolean
  findingId: string | null
  uri: string | null
  /** Workspace-relative path of `uri` from the init payload — null until
   * init (or forever, in standalone mode). Drives the header source link. */
  sourcePath: string | null
  /** 0-based call-site start line from the init payload — see
   * `ZzfxInitPayload.sourceLine` for the snapshot caveat. */
  sourceLine: number | null
  /** The variable declaration's location for a var-ref finding — see
   * `ZzfxInitPayload.def`. Null for literal calls, unreadable
   * declarations, and standalone mode. */
  def: { path: string; line: number } | null
  /** Asks the host to reveal the finding in its text editor (the header
   * source link's click). Fire-and-forget: the host owns the gone-finding
   * fallback, so there's nothing to surface here. */
  revealSource: () => void
  varRefName: string | null
  params: ZzfxParams
  /** True once any param/candidate has been applied since the last
   * successful `save()` (or since `zzfx/init` loaded, whichever is
   * later) — a plain unsaved-changes flag for the host-wiring unit's UI. */
  dirty: boolean
  category: string | null
  styles: string[]
  setParam: (key: ParamKey, value: number) => void
  setCategory: (category: string | null) => void
  setStyles: (styles: string[]) => void
  save: () => Promise<void>
  saving: boolean
  /** Monotonic count of committed saves. Increments only after the host's
   * zzfx/save response resolves (which awaits applyEdit), so it's a causal
   * "the edit landed" signal — ticking even on a no-op/canonicalizing save,
   * which `dirty` doesn't. e2e awaits its increment instead of racing a read. */
  saveGeneration: number
  saveError: string | null
  /** From `ZzfxInitPayload.loadError` (#148 Z7b part 2) — set when a
   * variable-spread call's initializer couldn't be read as a plain number
   * array. `params` is showing defaults, not this call's real values, in
   * this state. `save()` refuses locally (in addition to the host's own
   * independent revalidation) while this is set. */
  loadError: string | null

  /** Whether the host found an available vscode.lm model at init — see
   * ZzfxInitPayload.lmAvailable. Gates whether AiGeneratePanel shows the
   * Generate button vs. a static preset browser. */
  lmAvailable: boolean
  /** Curated preset library from the init payload, keyed by category —
   * used both by the "no LM" preset browser and (implicitly, host-side)
   * as the generate flow's fallback + prompt seeds. */
  presets: Record<string, { label: string; params: number[] }[]>
  /** Calls the host's AI Generate flow for the current category +
   * styles. Candidates arrive asynchronously via the `zzfx/generateResult`
   * push event (see `candidates`/`lastGenerateSource`), not as this
   * call's return value — this only rejects on a transport-level error. */
  generate: (n?: number) => Promise<void>
  generating: boolean
  generateError: string | null
  /** Accumulated streamed text from the in-flight (or most recent) live
   * generate call — empty for a cache/preset-sourced result. Reset at
   * the start of every `generate()` call. */
  generateStream: string
  /** Candidates from the most recent `generate()` call. Cleared at the
   * start of every new call. */
  candidates: ZzfxCandidate[]
  /** Where `candidates` actually came from. `null` until the first
   * `zzfx/generateResult` event arrives. */
  lastGenerateSource: ZzfxGenerateResultEvent['source'] | null
  /** Applies a candidate's params to the editor state (from either a
   * generate result or the preset browser) and marks the session dirty. */
  applyCandidate: (candidate: { params: number[] }) => void

  /** This source's persisted AI candidate history, newest batch first —
   * loaded from the init payload, then replaced wholesale by every
   * `zzfx/historyChanged` push. Durability is host-owned; the webview
   * never writes it, only asks the host to (the two calls below). */
  history: ZzfxHistoryBatch[]
  /** Deletes one persisted candidate (its batch's `ts` + index). The
   * updated list arrives via the `zzfx/historyChanged` push, not as a
   * return value. */
  deleteHistoryCandidate: (batchTs: number, index: number) => void
  /** Clears ALL persisted history for this source. The confirm affordance
   * is the caller's job (AiGeneratePanel's inline two-step). */
  clearHistory: () => void
  /** Transport-level failure from the last delete/clear request — without
   * it, a request that never reached the host would be indistinguishable
   * from a slow `zzfx/historyChanged` push. Cleared when the next history
   * change (or request) succeeds. */
  historyError: string | null

  /** The user's playback-volume trim as a resolved gain multiplier (1 =
   * baseline) — from the init payload, live-updated by `zzfx/config`
   * pushes. App.tsx wires it into audio.ts's module-level trim so every
   * play entry point picks it up. Standalone mode stays at 1. */
  playbackVolume: number

  /** The most recent `zzfx/play` push event from the host (CodeLens
   * `▶ Play` / `playAtCursor` — #148 Z3) — App.tsx watches this by
   * `requestId` identity to trigger playback through the same Web Audio
   * path the toolbar Play button uses. Fully decoupled from `params`/
   * `findingId`/`dirty` — a play request never edits the loaded session.
   * `null` until the first such event arrives. */
  playRequest: { params: (number | null | undefined)[]; requestId: number } | null
}

export function useZzfxSession(): ZzfxSessionState {
  const [standalone, setStandalone] = useState(false)
  const [findingId, setFindingId] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [sourceLine, setSourceLine] = useState<number | null>(null)
  const [def, setDef] = useState<{ path: string; line: number } | null>(null)
  const [varRefName, setVarRefName] = useState<string | null>(null)
  const [params, setParams] = useState<ZzfxParams>(() => defaultParams())
  const [dirty, setDirty] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [styles, setStyles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Monotonic count of committed saves — a causal completion signal (the host
  // awaits applyEdit before its zzfx/save response resolves). Unlike `dirty`,
  // it ticks even on a no-op/canonicalizing save, so e2e can await a real
  // "the edit landed" event instead of racing a bare file read.
  const [saveGeneration, setSaveGeneration] = useState(0)
  const [lmAvailable, setLmAvailable] = useState(false)
  const [presets, setPresets] = useState<Record<string, { label: string; params: number[] }[]>>({})
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateStream, setGenerateStream] = useState('')
  const [candidates, setCandidates] = useState<ZzfxCandidate[]>([])
  const [lastGenerateSource, setLastGenerateSource] = useState<ZzfxGenerateResultEvent['source'] | null>(null)
  const [playRequest, setPlayRequest] = useState<{
    params: (number | null | undefined)[]
    requestId: number
  } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [history, setHistory] = useState<ZzfxHistoryBatch[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [playbackVolume, setPlaybackVolume] = useState(1)
  const bridgeRef = useRef<ClientBridge | null>(null)
  const playRequestIdRef = useRef(0)

  useEffect(() => {
    let bridge: ClientBridge
    try {
      bridge = createClientBridge()
    } catch {
      // No acquireVsCodeApi() — standalone/dev render. Guard the bridge
      // entirely rather than let it throw on every subsequent call.
      setStandalone(true)
      return
    }
    bridgeRef.current = bridge
    // Register listeners BEFORE requesting ready — see tools/bridge/
    // CLAUDE.md's handshake convention.
    const offInit = bridge.on<ZzfxInitPayload>('zzfx/init', (p) => {
      setFindingId(p.findingId)
      setUri(p.uri)
      setSourcePath(p.sourcePath)
      setSourceLine(p.sourceLine)
      setDef(p.def ?? null)
      setVarRefName(p.varRef?.name ?? null)
      setParams(fromArgs(p.params))
      setDirty(false)
      setLoadError(p.loadError ?? null)
      setLmAvailable(p.lmAvailable)
      setPresets(p.presets)
      setHistory(p.history)
      setHistoryError(null)
      setPlaybackVolume(p.playbackVolume)
    })
    // Live playback-volume trim — the host pushes the already-resolved
    // multiplier whenever the setting changes.
    const offConfig = bridge.on<ZzfxConfigEvent>('zzfx/config', (p) => {
      setPlaybackVolume(p.playbackVolume)
    })
    // Full newest-first replacement — the host store owns durability; see
    // the `history` doc comment above.
    const offHistory = bridge.on<ZzfxHistoryChangedEvent>('zzfx/historyChanged', (p) => {
      setHistory(p.history)
      setHistoryError(null)
    })
    const offProgress = bridge.on<ZzfxGenerateProgressEvent>('zzfx/generateProgress', (p) => {
      setGenerateStream((prev) => prev + p.chunk)
    })
    const offResult = bridge.on<ZzfxGenerateResultEvent>('zzfx/generateResult', (p) => {
      setCandidates(p.candidates)
      setLastGenerateSource(p.source)
    })
    // CodeLens ▶ Play / playAtCursor route (#148 Z3) — a pure "make this
    // sound now" push, independent of the session's loaded finding.
    // `requestId` is a local monotonic counter (not the params themselves)
    // so App.tsx's effect fires even when the same sound is played twice
    // in a row.
    const offPlay = bridge.on<ZzfxPlayEvent>('zzfx/play', (p) => {
      playRequestIdRef.current += 1
      setPlayRequest({ params: p.params, requestId: playRequestIdRef.current })
    })
    void bridge.request('zzfx/ready')
    return () => {
      offInit()
      offConfig()
      offHistory()
      offProgress()
      offResult()
      offPlay()
      bridgeRef.current = null
    }
  }, [])

  const setParam = useCallback((key: ParamKey, value: number) => {
    setParams((prev) => ({ ...prev, [key]: clampParam(key, value) }))
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    const bridge = bridgeRef.current
    if (!bridge || !findingId) return
    // Local refusal, defense-in-depth: the host independently
    // re-validates the CURRENT declaration text at save time regardless
    // (#148 Z7b part 2) — this just avoids a round trip for a state the
    // webview already knows will be refused, and keeps the error message
    // consistent with what App.tsx already shows.
    if (loadError) {
      setSaveError(`Can't save — ${loadError}`)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const payload: ZzfxSavePayload = {
        findingId,
        params: toArgs(params),
        category: category ?? undefined,
        styles: styles.length > 0 ? styles : undefined,
      }
      await bridge.request<ZzfxSaveResult>('zzfx/save', payload)
      setDirty(false)
      setSaveGeneration((n) => n + 1)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [findingId, params, category, styles, loadError])

  const generate = useCallback(
    async (n: number = DEFAULT_CANDIDATE_COUNT) => {
      const bridge = bridgeRef.current
      if (!bridge || !category) return
      setGenerating(true)
      setGenerateError(null)
      setGenerateStream('')
      setCandidates([])
      try {
        const payload: ZzfxGeneratePayload = { category, styles, n }
        await bridge.request<ZzfxGenerateAck>('zzfx/generate', payload)
        // Candidates arrive via the zzfx/generateResult listener above —
        // this ack just confirms the host accepted the request.
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : String(err))
      } finally {
        setGenerating(false)
      }
    },
    [category, styles]
  )

  const applyCandidate = useCallback((candidate: { params: number[] }) => {
    setParams(fromArgs(candidate.params))
    setDirty(true)
  }, [])

  const deleteHistoryCandidate = useCallback((batchTs: number, index: number) => {
    const bridge = bridgeRef.current
    if (!bridge) return
    setHistoryError(null)
    const payload: ZzfxHistoryDeletePayload = { batchTs, index }
    bridge.request<ZzfxHistoryDeleteResult>('zzfx/history/delete', payload).catch((err) => {
      setHistoryError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  const clearHistory = useCallback(() => {
    const bridge = bridgeRef.current
    if (!bridge) return
    setHistoryError(null)
    bridge.request('zzfx/history/clear', {}).catch((err) => {
      setHistoryError(err instanceof Error ? err.message : String(err))
    })
  }, [])

  const revealSource = useCallback(() => {
    const bridge = bridgeRef.current
    if (!bridge) return
    // Fire-and-forget: the host owns the gone-finding fallback (open the
    // file at the open-time line, no toast), so a rejection here has
    // nothing actionable to show — swallow it rather than surface a
    // banner for a navigation click.
    void bridge.request('zzfx/revealSource', {}).catch(() => {})
  }, [])

  return {
    standalone,
    findingId,
    uri,
    sourcePath,
    sourceLine,
    def,
    revealSource,
    varRefName,
    params,
    dirty,
    category,
    styles,
    setParam,
    setCategory,
    setStyles,
    save,
    saving,
    saveGeneration,
    saveError,
    loadError,
    lmAvailable,
    presets,
    generate,
    generating,
    generateError,
    generateStream,
    candidates,
    lastGenerateSource,
    applyCandidate,
    history,
    deleteHistoryCandidate,
    clearHistory,
    historyError,
    playbackVolume,
    playRequest,
  }
}
