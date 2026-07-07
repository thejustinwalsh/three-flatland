/**
 * Wire types for the `codelens-service` Rust sidecar's JSON-RPC protocol.
 * Mirrors `tools/codelens-service/sidecar/src/model.rs` and `handlers.rs`
 * field-for-field — keep the two in sync by hand; there is no shared
 * schema generator between Rust and TypeScript here.
 */

/** 0-based line, UTF-16 code-unit character — VS Code / LSP convention. */
export interface Pos {
  line: number
  character: number
}

export interface Range {
  start: Pos
  end: Pos
}

/** Byte offsets (UTF-8) into the source text, distinct from {@link Range}. */
export interface ByteRange {
  start: number
  end: number
}

export interface VarRef {
  name: string
  defUri?: string
  /**
   * The initializer VALUE range — what a write-back replaces — never the
   * whole declarator (name, type annotation, and `=` excluded). Absent
   * when the declaration has no initializer to point at, even if defUri
   * is present (there's a real declaration site, just no value there yet).
   */
  defRange?: Range
}

export interface FindingPayload {
  params: number[]
  argRange: Range
  varRef?: VarRef
}

export const ZZFX_CALL_KIND = 'zzfx.call' as const

export interface Finding {
  kind: typeof ZZFX_CALL_KIND
  id: string
  range: Range
  byteRange: ByteRange
  payload: FindingPayload
}

export interface Capabilities {
  scan: boolean
  parse: boolean
  incremental: boolean
}

export interface InitializeParams {
  workspaceRoot: string
  storageUri: string
}

export interface InitializeResult {
  version: string
  capabilities: Capabilities
  /** Present (and `true`) only when the sidecar fell back to an in-memory cache. */
  degraded?: boolean
}

export interface ScanParams {
  candidates?: string[]
  include?: string
  exclude?: string
  maxFiles?: number
}

export interface ScanMatch {
  uri: string
  contentHash: string
  hasCandidate: boolean
}

export interface ScanResult {
  matches: ScanMatch[]
}

export interface ParseParams {
  uri: string
  text: string
}

export interface ParseResult {
  uri: string
  findings: Finding[]
}

export interface DidChangeParams {
  uri: string
  text: string
}

/** Request methods: each maps its params shape to its result shape. */
export interface RequestMethods {
  initialize: { params: InitializeParams; result: InitializeResult }
  'workspace/scan': { params: ScanParams; result: ScanResult }
  'document/parse': { params: ParseParams; result: ParseResult }
  shutdown: { params: undefined; result: null }
}

/** Notification methods: fire-and-forget, no response. */
export interface NotificationMethods {
  'document/didChange': DidChangeParams
}
