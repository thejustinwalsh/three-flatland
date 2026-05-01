import { readFile, writeFile, rename, stat } from 'node:fs/promises'
import { extname, join, dirname, basename } from 'node:path'
import { encodeImage } from './encode'
import { decodeImage } from './decode'
import type { EncodeFormat, ImageEncodeOptions } from './types'

export interface FileWriteOptions {
  force?: boolean
}

export async function encodeImageFile(
  input: string,
  output: string | null,
  opts: ImageEncodeOptions,
  fileOpts: FileWriteOptions = {},
): Promise<string> {
  const target = output ?? defaultOutputPath(input, opts.format)
  if (!fileOpts.force && (await exists(target))) {
    throw new Error(`refusing to overwrite existing file ${target} — pass --force to overwrite`)
  }

  const sourceBytes = await readFile(input)
  const sourceFormat = formatFromPath(input)
  const image = await decodeImage(new Uint8Array(sourceBytes), sourceFormat)
  const encoded = await encodeImage(image, opts)

  const tmp = target + '.tmp'
  await writeFile(tmp, encoded)
  await rename(tmp, target)
  return target
}

function defaultOutputPath(input: string, format: EncodeFormat): string {
  const ext = extname(input)
  const base = basename(input, ext)
  return join(dirname(input), `${base}.${format}`)
}

function formatFromPath(p: string): EncodeFormat {
  const ext = extname(p).toLowerCase().slice(1)
  if (ext === 'png' || ext === 'webp' || ext === 'avif' || ext === 'ktx2') return ext
  throw new Error(`cannot infer format from ${p}`)
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export interface BatchItem {
  input: string
  output?: string
  opts: ImageEncodeOptions
}

export interface BatchResult {
  input: string
  status: 'ok' | 'err'
  output?: string
  error?: string
  bytes?: number
  ms?: number
}

export async function* encodeImageBatch(
  items: BatchItem[],
  concurrency = 4,
): AsyncIterable<BatchResult> {
  const queue = items.slice()
  const inflight = new Set<Promise<BatchResult>>()
  const yieldQueue: BatchResult[] = []

  const start = (item: BatchItem): Promise<BatchResult> => {
    const t0 = Date.now()
    const p: Promise<BatchResult> = encodeImageFile(item.input, item.output ?? null, item.opts)
      .then<BatchResult>((out) => ({ input: item.input, status: 'ok', output: out, ms: Date.now() - t0 }))
      .catch<BatchResult>((err: Error) => ({ input: item.input, status: 'err', error: err.message, ms: Date.now() - t0 }))
    inflight.add(p)
    p.then((r) => {
      inflight.delete(p)
      yieldQueue.push(r)
    })
    return p
  }

  while (inflight.size < concurrency && queue.length > 0) start(queue.shift()!)
  while (inflight.size > 0 || queue.length > 0) {
    if (yieldQueue.length === 0) await Promise.race(inflight)
    while (yieldQueue.length > 0) yield yieldQueue.shift()!
    while (inflight.size < concurrency && queue.length > 0) start(queue.shift()!)
  }
}
