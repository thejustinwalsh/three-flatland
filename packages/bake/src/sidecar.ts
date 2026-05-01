import type { BakedSidecarMetadata } from './types.js'

/**
 * Derive the sibling URL for a baked asset.
 *
 * @example
 *   bakedSiblingURL('/sprites/knight.png', '.normal.png')
 *     // → '/sprites/knight.normal.png'
 *
 * Query strings and fragments are preserved:
 *   bakedSiblingURL('/a.png?v=2', '.normal.png')
 *     // → '/a.normal.png?v=2'
 */
export function bakedSiblingURL(sourceURL: string, suffix: string): string {
  return sourceURL.replace(/\.(\w+)($|[?#])/i, `${suffix}$2`)
}

/**
 * Stable content hash of any JSON-serializable value. FNV-1a 64-bit over
 * a canonical stringification (sorted keys). Deterministic across
 * browser and node, no deps, sync.
 *
 * Intended for cache invalidation of baked sidecars — not for any
 * cryptographic purpose.
 */
export function hashDescriptor(value: unknown): string {
  const canonical = stableStringify(value)
  return fnv1a64(canonical)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') +
    '}'
  )
}

function fnv1a64(str: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (let i = 0; i < str.length; i++) {
    hash = hash ^ BigInt(str.charCodeAt(i))
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

/**
 * HEAD-probe a baked sibling URL and, when `expectedHash` is provided,
 * range-fetch the PNG header to verify the tEXt stamp matches.
 *
 * Returns `{ ok: false }` when the sibling is missing or unreachable.
 * Returns `{ ok: true, hashMatches }` otherwise; callers decide whether
 * to use the baked file or re-generate in-memory.
 */
export async function probeBakedSibling(
  url: string,
  opts?: { expectedHash?: string }
): Promise<{ ok: true; hashMatches: boolean; url: string } | { ok: false }> {
  let head: Response
  try {
    head = await fetch(url, { method: 'HEAD' })
  } catch {
    return { ok: false }
  }
  if (!head.ok) return { ok: false }

  if (opts?.expectedHash === undefined) {
    return { ok: true, hashMatches: true, url }
  }

  // Range-fetch the PNG header to read the tEXt stamp. We don't need the
  // full image; the first ~4 KB comfortably covers signature + IHDR +
  // metadata chunks for every baker we emit.
  let header: Response
  try {
    header = await fetch(url, { headers: { Range: 'bytes=0-4095' } })
  } catch {
    return { ok: true, hashMatches: false, url }
  }
  if (!header.ok && header.status !== 206) {
    return { ok: true, hashMatches: false, url }
  }
  const buf = await header.arrayBuffer()
  const metaJSON = readPngTextChunk(buf, 'flatland')
  if (!metaJSON) return { ok: true, hashMatches: false, url }
  try {
    const meta = JSON.parse(metaJSON) as BakedSidecarMetadata
    return { ok: true, hashMatches: meta.hash === opts.expectedHash, url }
  } catch {
    return { ok: true, hashMatches: false, url }
  }
}

/**
 * Minimal PNG `tEXt` chunk reader. Walks chunks after the 8-byte
 * signature, stopping when it finds one whose keyword matches `key`.
 *
 * Returns the chunk's Latin-1 text value, or `null` when the keyword is
 * absent / the buffer is not a valid PNG.
 */
export function readPngTextChunk(buffer: ArrayBuffer, key: string): string | null {
  if (buffer.byteLength < 8) return null
  const view = new DataView(buffer)
  const expectedSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== expectedSig[i]) return null
  }

  let offset = 8
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    )
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.byteLength) return null

    if (type === 'tEXt') {
      let sepIdx = -1
      for (let i = dataStart; i < dataEnd; i++) {
        if (view.getUint8(i) === 0) {
          sepIdx = i
          break
        }
      }
      if (sepIdx > dataStart) {
        let keyword = ''
        for (let i = dataStart; i < sepIdx; i++) {
          keyword += String.fromCharCode(view.getUint8(i))
        }
        if (keyword === key) {
          let value = ''
          for (let i = sepIdx + 1; i < dataEnd; i++) {
            value += String.fromCharCode(view.getUint8(i))
          }
          return value
        }
      }
    }

    if (type === 'IEND') return null
    offset = dataEnd + 4
  }
  return null
}
