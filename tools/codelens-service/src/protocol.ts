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

export const ZZFX_CALL_KIND = 'zzfx.call' as const
export const ZZFXM_SONG_KIND = 'zzfxm.song' as const
export const AUDIO_FILE_KIND = 'audio.file' as const
export const WAD_SYNTH_KIND = 'wad.synth' as const

export interface ZzfxCallPayload {
  params: number[]
  argRange: Range
  varRef?: VarRef
}

/**
 * No `params`: a ZzFXM song is a deeply nested array, not a flat numeric
 * list — the client reads the text at `argRange` itself, the same posture
 * `varRef.defRange` already takes for an unresolved zzfx preset.
 */
export interface ZzfxmSongPayload {
  argRange: Range
  varRef?: VarRef
}

/** `pathRange` is the string literal's interior — no surrounding quotes/backticks. */
export interface AudioFilePayload {
  path: string
  pathRange: Range
}

/**
 * No pre-extracted config: `new Wad(...)`'s synthesis mode config is a
 * plain object literal (`{ source: 'sine' | 'square' | 'sawtooth' |
 * 'triangle' | 'noise', ... }`), not a flat numeric list — the client reads
 * the source text at `argRange` (or `varRef.defRange` for a bare-identifier
 * call) itself and parses it, the same posture `ZzfxmSongPayload` already
 * takes for a song.
 */
export interface WadSynthPayload {
  argRange: Range
  varRef?: VarRef
}

interface FindingBase {
  id: string
  range: Range
  byteRange: ByteRange
}

export interface ZzfxCallFinding extends FindingBase {
  kind: typeof ZZFX_CALL_KIND
  payload: ZzfxCallPayload
}

export interface ZzfxmSongFinding extends FindingBase {
  kind: typeof ZZFXM_SONG_KIND
  payload: ZzfxmSongPayload
}

export interface AudioFileFinding extends FindingBase {
  kind: typeof AUDIO_FILE_KIND
  payload: AudioFilePayload
}

export interface WadSynthFinding extends FindingBase {
  kind: typeof WAD_SYNTH_KIND
  payload: WadSynthPayload
}

/**
 * A discriminated union on `kind` — narrow with `finding.kind === ZZFX_CALL_KIND`
 * (etc.) before accessing `finding.payload`'s kind-specific fields.
 */
export type Finding = ZzfxCallFinding | ZzfxmSongFinding | AudioFileFinding | WadSynthFinding

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
