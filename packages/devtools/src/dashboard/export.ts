/**
 * Export helpers — drop the session's protocol log to a file the user
 * can attach to a bug report or inspect offline. Walks the IDB store
 * directly so even entries evicted from the in-memory cache make it
 * into the dump.
 *
 * Format: one JSON document with header + entries array. ArrayBuffer /
 * TypedArray payloads are serialised as `{__buf: base64, byteLength}`
 * so the dump survives a JSON round-trip without losing binary.
 */

const DB_NAME = 'tf-devtools-protocol'
const STORE = 'messages'

interface RawEntry {
  id: number
  providerId: string
  at: number
  direction: 'in' | 'out'
  type: string
  tag?: string
  frame?: number
  bytes: number
  msg: unknown
}

async function readAll(): Promise<RawEntry[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const entries = await new Promise<RawEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as RawEntry[])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return entries
}

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof ArrayBuffer) return tagBuffer(new Uint8Array(v), v.byteLength)
  if (ArrayBuffer.isView(v)) {
    const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
    return { ...tagBuffer(u, v.byteLength), ctor: v.constructor.name }
  }
  return v
}

function tagBuffer(u: Uint8Array, byteLength: number): { __buf: string; byteLength: number } {
  let binary = ''
  for (let i = 0; i < u.length; i++) binary += String.fromCharCode(u[i]!)
  return { __buf: btoa(binary), byteLength }
}

/**
 * Read the full session log and prompt the user to save a JSON dump.
 * Optional `providerId` narrows to a single producer.
 */
export async function exportSession(providerId: string | null = null): Promise<void> {
  const entries = await readAll()
  const filtered = providerId === null ? entries : entries.filter((e) => e.providerId === providerId)
  const payload = {
    exportedAt: new Date().toISOString(),
    providerId,
    count: filtered.length,
    entries: filtered,
  }
  const json = JSON.stringify(payload, replacer, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = providerId !== null
    ? `tf-devtools-${providerId}-${stamp}.json`
    : `tf-devtools-session-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
