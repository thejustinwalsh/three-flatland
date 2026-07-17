// Thin vscode.workspace.fs glue around history/core.ts — every DECISION
// (keying, append/prune, delete/clear, corrupt-degrade, merge) lives in
// core.ts; this file is plumbing, untested itself (no `vscode` module in
// vitest — same precedent as ../lm/service.ts).
//
// Persistence is HOST-side by design: the stakeholder's "should at least
// be using local storage" is the floor, but webview localStorage still
// rides the webview's lifecycle and profile storage — a JSON blob under
// `context.globalStorageUri` (sibling to zzfx-lm-cache.json, reusing its
// memoized-loader + read-merge-write patterns wholesale) survives panel
// moves, reloads, window restarts, and multiple panels by construction,
// with plumbing that already exists.
import * as vscode from 'vscode'
import type { ZzfxHistoryBatch } from '../../../../webview/audio/protocol'
import { createMemoizedLoader } from '../lm/memoizedLoader'
import {
  appendBatch,
  batchesFor,
  clearSource,
  deleteCandidate,
  mergeForWrite,
  parseHistoryFile,
  type HistoryFile,
} from './core'

const HISTORY_FILE_NAME = 'zzfx-lm-history.json'

export class ZzfxHistoryStore {
  /** Memoized so two concurrent cold loads (two panels opening at once)
   * share ONE file read — same reasoning as ZzfxLmService.cacheLoader. */
  private loader: ReturnType<typeof createMemoizedLoader<HistoryFile>> | null = null

  constructor(private readonly context: vscode.ExtensionContext) {}

  /** `key`'s persisted batches, newest-first — the order the panel renders. */
  async getBatches(key: string): Promise<ZzfxHistoryBatch[]> {
    return batchesFor(await this.load(), key)
  }

  /** Appends a batch and persists; resolves with the key's updated
   * newest-first batches (what the host pushes as `zzfx/historyChanged`). */
  async append(key: string, batch: ZzfxHistoryBatch): Promise<ZzfxHistoryBatch[]> {
    return this.write(key, (file) => appendBatch(file, key, batch))
  }

  /** Deletes one candidate (no-op if already gone) and persists. */
  async deleteCandidate(key: string, batchTs: number, index: number): Promise<ZzfxHistoryBatch[]> {
    return this.write(key, (file) => deleteCandidate(file, key, batchTs, index))
  }

  /** Clears the key's whole history and persists. */
  async clear(key: string): Promise<ZzfxHistoryBatch[]> {
    return this.write(key, (file) => clearSource(file, key))
  }

  private get file(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, HISTORY_FILE_NAME)
  }

  private async readDisk(): Promise<HistoryFile> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.file)
      return parseHistoryFile(new TextDecoder().decode(bytes))
    } catch {
      // Missing file (first run) or unreadable — degrade to empty, same
      // policy as parseHistoryFile's corrupt-text handling.
      return {}
    }
  }

  private async load(): Promise<HistoryFile> {
    this.loader ??= createMemoizedLoader(() => this.readDisk())
    return this.loader.get()
  }

  /** Read-merge-write, mirroring ZzfxLmService.cacheStore().set — the
   * in-memory map is updated first (same-process safety comes from the
   * ONE shared store instance), then merged OVER a fresh disk read so a
   * key written by another process since our load survives instead of
   * being clobbered. */
  private async write(key: string, apply: (file: HistoryFile) => HistoryFile): Promise<ZzfxHistoryBatch[]> {
    const current = await this.load()
    const next = apply(current)
    this.loader!.set(next)

    const onDisk = await this.readDisk()
    const merged = mergeForWrite(onDisk, next, key)
    this.loader!.set(merged)

    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri)
    await vscode.workspace.fs.writeFile(this.file, new TextEncoder().encode(JSON.stringify(merged)))
    return batchesFor(merged, key)
  }
}

// ONE store for the whole extension host (same singleton reasoning as
// host.ts's getLmService): a single shared in-memory map makes
// same-process writes from multiple panels correct by construction.
let storeInstance: ZzfxHistoryStore | undefined
export function getZzfxHistoryStore(context: vscode.ExtensionContext): ZzfxHistoryStore {
  if (!storeInstance) storeInstance = new ZzfxHistoryStore(context)
  return storeInstance
}
