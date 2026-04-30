import type { MergeResult } from '@three-flatland/io/atlas'
import type { MergeState } from './mergeStore'
// `?worker&inline` embeds the worker source in the main bundle and
// instantiates it via blob URL — required because vscode-webview:// has
// no http(s) origin to resolve a separate `*.worker.js` against, so
// `new Worker(url)` would throw SecurityError.
import CompositeWorker from './compositeWorker?worker&inline'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new CompositeWorker({ name: 'fl-merge-composite' })
  worker.onmessage = (e: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
    const { id, blob, error } = e.data
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (error || !blob) entry.reject(new Error(error ?? 'composite worker returned no blob'))
    else entry.resolve(blob)
  }
  worker.onerror = (e) => {
    // Reject every in-flight request — the worker is in an unrecoverable state.
    for (const entry of pending.values()) {
      entry.reject(new Error(e.message || 'composite worker error'))
    }
    pending.clear()
    worker = null
  }
  return worker
}

// Composite each source frame onto an off-main-thread OffscreenCanvas
// at its packed position. PNG encode happens in the worker. Returns
// the PNG-encoded Blob ready for ObjectURL or shipping to the host
// for write.
export async function compositePngBlob(
  result: Extract<MergeResult, { kind: 'ok' }>,
  sources: MergeState['sources'],
): Promise<Blob | null> {
  const { atlas, placements } = result
  if (atlas.meta.size.w === 0 || atlas.meta.size.h === 0) return null

  // Fetch unique source images on the main thread once (vscode-webview://
  // URIs resolve here; the worker context can't always fetch them).
  // Blobs are structurally cloneable cheaply — bytes aren't copied
  // when shipped to the worker.
  const blobByUri = new Map<string, Blob>()
  for (const src of sources) {
    if (blobByUri.has(src.uri)) continue
    const res = await fetch(src.imageUri)
    blobByUri.set(src.uri, await res.blob())
  }

  const w = ensureWorker()
  const id = nextId++
  return await new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({
      id,
      width: atlas.meta.size.w,
      height: atlas.meta.size.h,
      placements: placements.map((p) => ({
        sourceUri: p.sourceUri,
        srcRect: p.srcRect,
        dstRect: p.dstRect,
      })),
      sources: [...blobByUri].map(([uri, blob]) => ({ uri, blob })),
    })
  })
}
