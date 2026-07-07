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
  ZzfxGenerateProgressEvent,
  ZzfxGeneratePayload,
  ZzfxGenerateResult,
  ZzfxInitPayload,
  ZzfxSavePayload,
  ZzfxSaveResult,
} from './protocol'

export type ZzfxSessionState = {
  /** True when `acquireVsCodeApi()` isn't available — dev/standalone run
   * outside a VSCode webview host. Params stay at their defaults, Save
   * is a no-op, Play still works (it's pure Web Audio). */
  standalone: boolean
  findingId: string | null
  uri: string | null
  varRefName: string | null
  params: ZzfxParams
  category: string | null
  styles: string[]
  setParam: (key: ParamKey, value: number) => void
  setCategory: (category: string | null) => void
  setStyles: (styles: string[]) => void
  save: () => Promise<void>
  saving: boolean
  saveError: string | null
  /** Calls the host's AI Generate flow (vscode.lm, falling back to a
   * curated preset) for the current category + styles, and applies the
   * result to `params` on success. */
  generate: () => Promise<void>
  generating: boolean
  generateError: string | null
  /** Accumulated streamed text from the in-flight (or most recent)
   * generate call — empty for a preset-sourced result, since there's
   * nothing to stream in that path. Reset at the start of every call. */
  generateStream: string
  /** Where the most recently applied params actually came from. `null`
   * until the first successful `generate()` call. */
  lastGenerateSource: ZzfxGenerateResult['source'] | null
}

export function useZzfxSession(): ZzfxSessionState {
  const [standalone, setStandalone] = useState(false)
  const [findingId, setFindingId] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [varRefName, setVarRefName] = useState<string | null>(null)
  const [params, setParams] = useState<ZzfxParams>(() => defaultParams())
  const [category, setCategory] = useState<string | null>(null)
  const [styles, setStyles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateStream, setGenerateStream] = useState('')
  const [lastGenerateSource, setLastGenerateSource] = useState<ZzfxGenerateResult['source'] | null>(
    null
  )
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
    // Register the init listener BEFORE requesting ready — see
    // tools/bridge/CLAUDE.md's handshake convention.
    const offInit = bridge.on<ZzfxInitPayload>('zzfx/init', (p) => {
      setFindingId(p.findingId)
      setUri(p.uri)
      setVarRefName(p.varRef?.name ?? null)
      setParams(fromArgs(p.params))
    })
    const offProgress = bridge.on<ZzfxGenerateProgressEvent>('zzfx/generate/progress', (p) => {
      setGenerateStream((prev) => prev + p.chunk)
    })
    void bridge.request('zzfx/ready')
    return () => {
      offInit()
      offProgress()
      bridgeRef.current = null
    }
  }, [])

  const setParam = useCallback((key: ParamKey, value: number) => {
    setParams((prev) => ({ ...prev, [key]: clampParam(key, value) }))
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [findingId, params, category, styles])

  const generate = useCallback(async () => {
    const bridge = bridgeRef.current
    if (!bridge) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateStream('')
    try {
      const payload: ZzfxGeneratePayload = {
        category: category ?? undefined,
        styles: styles.length > 0 ? styles : undefined,
      }
      const result = await bridge.request<ZzfxGenerateResult>('zzfx/generate', payload)
      setParams(fromArgs(result.params))
      setLastGenerateSource(result.source)
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [category, styles])

  return {
    standalone,
    findingId,
    uri,
    varRefName,
    params,
    category,
    styles,
    setParam,
    setCategory,
    setStyles,
    save,
    saving,
    saveError,
    generate,
    generating,
    generateError,
    generateStream,
    lastGenerateSource,
  }
}
