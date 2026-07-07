// Thin real implementations of lmService.ts's injected LmCaller/
// CacheStore/hash — every vscode.lm / vscode.workspace.fs / node:crypto
// touch lives here and ONLY here, deliberately kept minimal so the
// interesting logic (retry, validation, caching, fallback) stays in the
// unit-tested pure core. Not unit-tested itself (no vscode module in
// vitest) — same precedent as webview/zzfx/audio.ts for the AudioContext
// boundary. Verify manually once Z3 wires this into a live panel.
import * as vscode from 'vscode'
import { createHash } from 'node:crypto'
import type { CacheStore, LmCaller } from './lmService'
import { log } from '../../log'

const REQUEST_TIMEOUT_MS = 20_000
const CACHE_MAX_ENTRIES = 200

export function createSha256Hasher(): (text: string) => string {
  return (text) => createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * `LanguageModelChat.sendRequest` must only be called in response to a
 * user action (per its own doc comment) — satisfied here because every
 * caller of `generateZzfxParams` originates from the webview's Generate
 * button, itself a `bridge.request('zzfx/generate', ...)` fired from a
 * click handler.
 */
export function createVscodeLmCaller(): LmCaller {
  return {
    async send(prompt, onChunk) {
      if (typeof vscode.lm?.selectChatModels !== 'function') {
        // vscode.lm doesn't exist in this editor host at all (e.g. an
        // older VSCode, or a fork that hasn't implemented the API) —
        // this is the "capability" case, not an error.
        return null
      }

      let models: vscode.LanguageModelChat[]
      try {
        models = await vscode.lm.selectChatModels()
      } catch (err) {
        log(`zzfx lm: selectChatModels failed: ${err instanceof Error ? err.message : err}`)
        return null
      }
      const model = models[0]
      if (!model) return null

      const cts = new vscode.CancellationTokenSource()
      const timeout = setTimeout(() => cts.cancel(), REQUEST_TIMEOUT_MS)
      try {
        const response = await model.sendRequest(
          [vscode.LanguageModelChatMessage.User(prompt)],
          {
            justification:
              'Generate a ZzFX sound-effect parameter set from the selected category and style tags.',
          },
          cts.token
        )
        let out = ''
        for await (const chunk of response.text) {
          out += chunk
          onChunk?.(chunk)
        }
        return out
      } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
          log(`zzfx lm: ${err.code} — ${err.message}`)
          return null
        }
        log(`zzfx lm: sendRequest failed: ${err instanceof Error ? err.message : err}`)
        return null
      } finally {
        clearTimeout(timeout)
        cts.dispose()
      }
    },
  }
}

/**
 * Single JSON blob at `<globalStorageUri>/zzfx-lm-cache.json` mapping
 * sha256(prompt) -> validated params JSON. Loaded lazily, cached
 * in-memory for the life of the extension host, capped to
 * `CACHE_MAX_ENTRIES` (oldest — by insertion order — evicted first).
 */
export function createVscodeCacheStore(context: vscode.ExtensionContext): CacheStore {
  const file = vscode.Uri.joinPath(context.globalStorageUri, 'zzfx-lm-cache.json')
  let loaded: Record<string, string> | null = null

  async function load(): Promise<Record<string, string>> {
    if (loaded) return loaded
    try {
      const bytes = await vscode.workspace.fs.readFile(file)
      loaded = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>
    } catch {
      loaded = {}
    }
    return loaded
  }

  async function persist(map: Record<string, string>): Promise<void> {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri)
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(JSON.stringify(map)))
  }

  return {
    async get(key) {
      const map = await load()
      return map[key]
    },
    async set(key, value) {
      const map = await load()
      map[key] = value
      const keys = Object.keys(map)
      if (keys.length > CACHE_MAX_ENTRIES) {
        for (const evict of keys.slice(0, keys.length - CACHE_MAX_ENTRIES)) delete map[evict]
      }
      await persist(map)
    },
  }
}
