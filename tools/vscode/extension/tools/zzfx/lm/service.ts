// Thin real implementation of core.ts's injected LmSend/CacheStore/hash —
// every vscode.lm / vscode.workspace.fs / node:crypto touch lives here
// and ONLY here. Every DECISION (cache-then-lm-then-preset, one retry,
// what counts as valid) lives in core.ts; this file is plumbing. Not
// unit-tested itself (no vscode module in vitest) — same precedent as
// webview/zzfx/audio.ts's untested AudioContext boundary. Verify manually
// once Z3 wires this into a live panel.
import * as vscode from 'vscode'
import { createHash } from 'node:crypto'
import {
  runGeneration,
  type Candidate,
  type CacheStore,
  type GenerateOutcome,
  type LmSend,
} from './core'
import { log } from '../../../log'

const REQUEST_TIMEOUT_MS = 20_000
const CACHE_FILE_NAME = 'zzfx-lm-cache.json'
const CACHE_MAX_ENTRIES = 200

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export type GenerateArgs = {
  category: string
  styles: readonly string[]
  n: number
}

/**
 * vscode.lm-backed sound generator with a curated-preset degrade path.
 * Instantiate once per extension activation (or per panel — cheap either
 * way, holds no per-request state) and call from a `zzfx/generate`
 * bridge handler:
 *
 * ```ts
 * const lmService = new ZzfxLmService(context)
 * bridge.emit('zzfx/init', { ..., lmAvailable: await lmService.isAvailable() })
 * bridge.on('zzfx/generate', async ({ category, styles, n }) => {
 *   const outcome = await lmService.generate({ category, styles, n }, (chunk) =>
 *     bridge.emit('zzfx/generate/progress', { chunk }))
 *   bridge.emit('zzfx/generateResult', {
 *     candidates: outcome.candidates,
 *     fromCache: outcome.source === 'cache',
 *     source: outcome.source,
 *   })
 *   return { ok: true }
 * })
 * ```
 */
export class ZzfxLmService {
  private cachedMap: Record<string, string> | null = null

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Cheap availability probe — whether a `copilot`-vendor chat model
   * exists at all in this editor host. Drives `ZzfxInitPayload.lmAvailable`,
   * which the webview uses to decide whether to show the Generate button
   * or fall straight to the preset library (this extension targets
   * VSCode, Cursor, and Antigravity — `vscode.lm` may not exist in all
   * three, and even where it does, no chat model may be signed in).
   */
  async isAvailable(): Promise<boolean> {
    return (await this.selectModels()).length > 0
  }

  /**
   * Generates `n` candidates for `category`/`styles`, degrading through
   * cache → live model (one retry) → curated preset. See `core.ts`'s
   * `runGeneration` for the full decision tree — this method only
   * resolves the injected `send`/`cache`/`hash`/`modelId`.
   */
  async generate(args: GenerateArgs, onChunk?: (chunk: string) => void): Promise<GenerateOutcome> {
    const models = await this.selectModels()
    const model = models[0]
    const send: LmSend = model
      ? (prompt, cb) => this.sendToModel(model, prompt, cb)
      : async () => null

    return runGeneration({
      category: args.category,
      styles: args.styles,
      n: args.n,
      modelId: model?.id ?? 'none',
      send,
      cache: this.cacheStore(),
      hash: sha256Hex,
      onChunk,
    })
  }

  private async selectModels(): Promise<vscode.LanguageModelChat[]> {
    if (typeof vscode.lm?.selectChatModels !== 'function') return []
    try {
      return await vscode.lm.selectChatModels({ vendor: 'copilot' })
    } catch (err) {
      log(`zzfx lm: selectChatModels failed: ${err instanceof Error ? err.message : err}`)
      return []
    }
  }

  /**
   * `LanguageModelChat.sendRequest` must only be called in response to a
   * user action (per its own doc comment) — satisfied because every
   * caller of `generate()` originates from the webview's Generate
   * button, itself a `bridge.request('zzfx/generate', ...)` fired from a
   * click handler.
   */
  private async sendToModel(
    model: vscode.LanguageModelChat,
    prompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string | null> {
    const cts = new vscode.CancellationTokenSource()
    const timeout = setTimeout(() => cts.cancel(), REQUEST_TIMEOUT_MS)
    try {
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {
          justification:
            'Generate ZzFX sound-effect candidate params from the selected category and style tags.',
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
  }

  /**
   * Single JSON blob at `<globalStorageUri>/zzfx-lm-cache.json` mapping
   * cache key -> `JSON.stringify({candidates})`. Loaded lazily, held
   * in-memory for the life of this service instance, capped at
   * `CACHE_MAX_ENTRIES` (oldest — by insertion order — evicted first).
   */
  private cacheStore(): CacheStore {
    const file = vscode.Uri.joinPath(this.context.globalStorageUri, CACHE_FILE_NAME)

    const load = async (): Promise<Record<string, string>> => {
      if (this.cachedMap) return this.cachedMap
      try {
        const bytes = await vscode.workspace.fs.readFile(file)
        this.cachedMap = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>
      } catch {
        this.cachedMap = {}
      }
      return this.cachedMap
    }

    const persist = async (map: Record<string, string>): Promise<void> => {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri)
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
}

export type { Candidate, GenerateOutcome }
