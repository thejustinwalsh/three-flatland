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
import type { ZzfxInitPayload, ZzfxSavePayload, ZzfxSaveResult } from './protocol'

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
    const off = bridge.on<ZzfxInitPayload>('zzfx/init', (p) => {
      setFindingId(p.findingId)
      setUri(p.uri)
      setVarRefName(p.varRef?.name ?? null)
      setParams(fromArgs(p.params))
    })
    void bridge.request('zzfx/ready')
    return () => {
      off()
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
  }
}
