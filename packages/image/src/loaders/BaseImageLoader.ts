import type { Texture, WebGLRenderer } from 'three'
import type { WebGPURenderer } from 'three/webgpu'

export type LoaderRenderer = WebGLRenderer | WebGPURenderer | null

export interface LoaderRequest {
  bytes?: Uint8Array | ArrayBuffer
  url?: string
  renderer?: LoaderRenderer
  options?: unknown
}

export interface LoaderInput {
  bytes?: Uint8Array
  url?: string
}

export interface LoaderResult<T extends Texture = Texture> {
  texture: T
  meta?: Record<string, unknown>
  recovery?: RecoveryDescriptor
}

export type RecoveryDescriptor =
  | { kind: 'url'; url: string; format: string; options?: unknown }
  | { kind: 'generator'; format: string; generate: () => Promise<{ bytes: Uint8Array; format: string }> }
  | { kind: 'external'; format: string; onRecover: () => Promise<{ bytes: Uint8Array; format: string }> }
  | { kind: 'retained'; bytes: Uint8Array; format: string }

export abstract class BaseImageLoader<T extends Texture = Texture> {
  abstract readonly format: string

  abstract supports(input: LoaderInput): boolean

  abstract parse(req: LoaderRequest): Promise<LoaderResult<T>>

  protected async fetchBytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetchBytes(${url}): HTTP ${res.status} ${res.statusText}`)
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  protected extOf(url: string): string {
    const noQuery = url.split('?', 1)[0]!.split('#', 1)[0]!
    const slash = noQuery.lastIndexOf('/')
    const tail = slash >= 0 ? noQuery.slice(slash + 1) : noQuery
    const dot = tail.lastIndexOf('.')
    if (dot < 0) return ''
    return tail.slice(dot + 1).toLowerCase()
  }

  protected toBytes(src: Uint8Array | ArrayBuffer): Uint8Array {
    return src instanceof Uint8Array ? src : new Uint8Array(src)
  }

  protected async resolveBytes(req: LoaderRequest): Promise<Uint8Array> {
    if (req.bytes) return this.toBytes(req.bytes)
    if (req.url) return this.fetchBytes(req.url)
    throw new Error(`${this.format}: LoaderRequest requires either bytes or url`)
  }
}
