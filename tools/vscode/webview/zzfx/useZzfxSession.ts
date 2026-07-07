import { useCallback, useEffect, useRef, useState } from 'react'
import { createClientBridge, type ClientBridge } from '@three-flatland/bridge/client'
import {
  defaultParams,
  fromArgs,
  toArgs,
  clampParam,
  type ParamKey,
  type ZzfxParams,
} from './params'
import type {
  ZzfxCandidate,
  ZzfxGenerateAck,
  ZzfxGeneratePayload,
  ZzfxGenerateProgressEvent,
  ZzfxGenerateResultEvent,
  ZzfxInitPayload,
  ZzfxSavePayload,
  ZzfxSaveResult,
} from './protocol'

export const DEFAULT_CANDIDATE_COUNT = 3

export type ZzfxSessionState = {
  /** True when `acquireVsCodeApi()` isn't available — dev/standalone run
   * outside a VSCode webview host. Params stay at their defaults, Save
   * and Generate are both no-ops (Generate requires the bridge — even
   * the preset-browsing fallback needs `presets` from the host's init
   * payload), Play still works (it's pure Web Audio). */
  standalone: boolean
  findingId: string | null
  uri: string | null
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
  saveError: string | null

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
}

export function useZzfxSession(): ZzfxSessionState {
  const [standalone, setStandalone] = useState(false)
  const [findingId, setFindingId] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [varRefName, setVarRefName] = useState<string | null>(null)
  const [params, setParams] = useState<ZzfxParams>(() => defaultParams())
  const [dirty, setDirty] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [styles, setStyles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lmAvailable, setLmAvailable] = useState(false)
  const [presets, setPresets] = useState<Record<string, { label: string; params: number[] }[]>>({})
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateStream, setGenerateStream] = useState('')
  const [candidates, setCandidates] = useState<ZzfxCandidate[]>([])
  const [lastGenerateSource, setLastGenerateSource] = useState<
    ZzfxGenerateResultEvent['source'] | null
  >(null)
  const bridgeRef = useRef<ClientBridge | null>(null)

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
      setVarRefName(p.varRef?.name ?? null)
      setParams(fromArgs(p.params))
      setDirty(false)
      setLmAvailable(p.lmAvailable)
      setPresets(p.presets)
    })
    const offProgress = bridge.on<ZzfxGenerateProgressEvent>('zzfx/generateProgress', (p) => {
      setGenerateStream((prev) => prev + p.chunk)
    })
    const offResult = bridge.on<ZzfxGenerateResultEvent>('zzfx/generateResult', (p) => {
      setCandidates(p.candidates)
      setLastGenerateSource(p.source)
    })
    void bridge.request('zzfx/ready')
    return () => {
      offInit()
      offProgress()
      offResult()
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [findingId, params, category, styles])

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

  return {
    standalone,
    findingId,
    uri,
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
    saveError,
    lmAvailable,
    presets,
    generate,
    generating,
    generateError,
    generateStream,
    candidates,
    lastGenerateSource,
    applyCandidate,
  }
}
