#!/usr/bin/env tsx
/**
 * add-track — ingest a `zzfxm(...)` one-liner exported from ZzFX Studio
 * (https://thejustinwalsh.github.io/zzfx-studio) and append it to
 * `docs/public/audio/tracks.json`. Run as `pnpm tracks:add` from repo
 * root.
 *
 * Usage:
 *   pnpm tracks:add                            # interactive — paste snippet on stdin
 *   pnpm tracks:add path/to/song.js            # parse a file
 *   pnpm tracks:add --id foil --title Foil --gem gold --credit "zzfx-studio" path/to/song.js
 *
 * Snippet shape (output of ZzFX Studio's "Copy Oneliner" / Export Code):
 *   zzfxm([...instruments],[...patterns],[...sequence],bpm);
 *   // or a // @zzfx-studio metadata comment + the same call below
 *
 * Parser strategy: locate `zzfxm(` then balanced-bracket walk through
 * each of the four top-level arguments. Numeric-only contents mean
 * `JSON.parse` can read each argument once isolated. NO `eval` — we
 * don't execute the snippet.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream, openSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import type { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const TRACKS_PATH = resolve(REPO_ROOT, 'docs/public/audio/tracks.json')

type Gem = 'gold' | 'ruby' | 'emerald' | 'diamond' | 'amethyst' | 'pink' | 'salmon' | 'turquoize'
const GEM_VALUES: readonly Gem[] = ['gold', 'ruby', 'emerald', 'diamond', 'amethyst', 'pink', 'salmon', 'turquoize']

/** ZzFX Studio's five vibe presets, mapped to our gem palette. Each vibe
 * has a distinct mood the DAW expresses through scale, density, and
 * instrument choice — we mirror those moods to gems that fit the
 * brand: titleScreen (heroic, bright) → gold, battle (intensity) →
 * ruby, dungeon (deep, mossy) → emerald, adventure (exploration) →
 * amethyst, boss (dramatic) → pink. Falls back to amethyst when the
 * vibe is missing or unrecognized. */
const VIBE_TO_GEM: Record<string, Gem> = {
  titleScreen: 'gold',
  battle: 'ruby',
  dungeon: 'emerald',
  adventure: 'amethyst',
  boss: 'pink',
}

type Track = {
  id: string
  title: string
  credit?: string
  /** Optional URL for the credit link in the player popover. Omitted
   * when the credit defaults to "zzfx-studio" — the player resolves
   * to https://thejustinwalsh.github.io/zzfx-studio/ in that case. */
  creditUrl?: string
  gem?: Gem
  bpm: number
  instruments: number[][]
  patterns: number[][][]
  sequence: number[]
}

const ZZFX_STUDIO_URL = 'https://thejustinwalsh.github.io/zzfx-studio/'

type TracksLibrary = {
  version: 1
  tracks: Track[]
}

type Args = {
  file?: string
  id?: string
  title?: string
  gem?: Gem
  credit?: string
  creditUrl?: string
  force: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--force') args.force = true
    else if (a === '--id' && argv[i + 1]) args.id = argv[++i]
    else if (a === '--title' && argv[i + 1]) args.title = argv[++i]
    else if (a === '--gem' && argv[i + 1]) {
      const v = argv[++i] as Gem
      if (!GEM_VALUES.includes(v)) throw new Error(`Invalid gem '${v}'. Valid: ${GEM_VALUES.join(', ')}`)
      args.gem = v
    } else if (a === '--credit' && argv[i + 1]) args.credit = argv[++i]
    else if (a === '--credit-url' && argv[i + 1]) args.creditUrl = argv[++i]
    else if (!a.startsWith('--')) args.file = a
  }
  return args
}

/** Normalize a JS array literal so JSON.parse can read it.
 *
 *   - Empty array slots (`,,`, `[,`, `,]`) → explicit `null`.
 *     ZzFX/ZzFXM exports use array holes for elided default params
 *     (the parameter array `[1,,.1,,1]` skips positions 2 and 4).
 *   - Bare decimals (`.5`) → leading-zero form (`0.5`).
 *   - Negative bare decimals (`-.5`) → `-0.5`.
 *
 * Operates on the textual array literal — does NOT evaluate. */
function normalizeJsArrayLiteral(src: string): string {
  let out = src
  // Insert `null` for consecutive commas (repeated until none remain —
  // a run of 3 commas would otherwise produce only 1 fill on a single
  // pass).
  while (/,\s*,/.test(out)) out = out.replace(/,(\s*),/g, ',$1null,$1')
  // Leading hole: `[ ,` → `[null,`
  out = out.replace(/\[(\s*),/g, '[$1null,')
  // Trailing hole: `, ]` → `,null]`
  out = out.replace(/,(\s*)\]/g, ',$1null]')
  // Bare decimal: `.5` → `0.5`. Match where preceded by start, comma,
  // bracket, whitespace, or operator (so we don't break e.g. `1.5`).
  out = out.replace(/(^|[,[\s\-+])\.(\d)/g, '$10.$2')
  return out
}

/** Extract the `// @zzfx-studio {…json…}` metadata comment ZzFX Studio's
 * Export Code / Export JS includes. The JSON is single-line and lives
 * on a comment line of its own. Returns the parsed object, or null when
 * absent (e.g., hand-authored snippets). */
function extractZzfxStudioMetadata(src: string): {
  config?: { name?: string; vibe?: string; bpm?: number }
} | null {
  const match = src.match(/\/\/\s*@zzfx-studio\s+(\{.*?\})\s*$/m)
  if (!match) return null
  try {
    return JSON.parse(match[1]!) as { config?: { name?: string; vibe?: string; bpm?: number } }
  } catch {
    return null
  }
}

/** Walk forward from `i` matching `open`/`close` brackets, return the
 * index of the matching `close`. Throws if unbalanced. Ignores brackets
 * inside string literals (zzfxm exports are number-only so we don't
 * actually expect strings, but the guard is cheap). */
function matchBracket(src: string, i: number, open: string, close: string): number {
  let depth = 0
  let inString: string | null = null
  for (; i < src.length; i++) {
    const ch = src[i]!
    if (inString) {
      if (ch === '\\') {
        i++ // skip escaped char
        continue
      }
      if (ch === inString) inString = null
    } else if (ch === '"' || ch === "'") {
      inString = ch
    } else if (ch === open) {
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`Unbalanced '${open}'`)
}

/** Locate the array literal assigned to `const NAME = [...]` (or `let`/
 * `var`) in `src` and return its textual range. Returns null if no
 * declaration found. This handles ZzFX Studio's "Copy Code" output
 * which splits song data across three `const` declarations and passes
 * variable names into `zzfxm()` — the oneliner-only parser would see
 * `zzfxm(instruments, patterns, sequence, 82)` with no inline arrays
 * and bail. */
function findNamedArrayDeclaration(src: string, name: string): string | null {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`)
  const m = re.exec(src)
  if (!m) return null
  const lb = m.index + m[0].length - 1 // position of `[`
  const rb = matchBracket(src, lb, '[', ']')
  return src.slice(lb, rb + 1)
}

/** Parse a ZzFX Studio snippet — handles BOTH variants the DAW exports:
 *
 *   - Oneliner / Copy Oneliner: `zzfxm([...],[...],[...],bpm);`
 *     (all data inline as the call's positional args)
 *   - Copy Code / Export JS: full file with
 *       const instruments = [...];
 *       const patterns = [...];
 *       const sequence = [...];
 *       zzfxm(instruments, patterns, sequence, bpm);
 *
 * Returns the four logical pieces ready to assemble into a Track. */
function parseZzfxmSnippet(src: string): {
  instruments: number[][]
  patterns: number[][][]
  sequence: number[]
  bpm: number
} {
  const callStart = src.search(/zzfxm\s*\(/)
  if (callStart < 0) throw new Error('No `zzfxm(` call found in snippet.')
  const parenOpen = src.indexOf('(', callStart)
  const parenClose = matchBracket(src, parenOpen, '(', ')')
  const argsStr = src.slice(parenOpen + 1, parenClose)

  // First try the oneliner: walk three inline arrays inside zzfxm(...).
  const inlineArrays: string[] = []
  let cursor = 0
  while (inlineArrays.length < 3) {
    const lb = argsStr.indexOf('[', cursor)
    if (lb < 0) break
    const rb = matchBracket(argsStr, lb, '[', ']')
    inlineArrays.push(argsStr.slice(lb, rb + 1))
    cursor = rb + 1
  }

  // If oneliner didn't yield 3 arrays, fall back to `const instruments
  // = [...]` / `const patterns = [...]` / `const sequence = [...]`
  // declarations — the Copy Code shape.
  const arrays =
    inlineArrays.length === 3
      ? inlineArrays
      : (() => {
          const i = findNamedArrayDeclaration(src, 'instruments')
          const p = findNamedArrayDeclaration(src, 'patterns')
          const s = findNamedArrayDeclaration(src, 'sequence')
          if (!i || !p || !s) {
            const found = [i && 'instruments', p && 'patterns', s && 'sequence'].filter(Boolean).join(', ')
            throw new Error(
              `Expected 3 array arguments inside zzfxm(...) OR three named declarations (const instruments/patterns/sequence). Found inline: ${inlineArrays.length}, named: ${found || 'none'}.`
            )
          }
          return [i, p, s]
        })()

  // BPM: parse the trailing arg of zzfxm(...). In the oneliner case
  // this is the slice after the 3 arrays; in the Copy Code case it's
  // the slice after the 3 variable names (commas + identifiers + BPM).
  const tail =
    inlineArrays.length === 3
      ? argsStr
          .slice(cursor)
          .replace(/^[\s,]+/, '')
          .replace(/[\s,;]+$/, '')
      : argsStr
          .split(',')
          .slice(3)
          .join(',')
          .replace(/[\s,;]+$/, '')
          .trim()
  const bpm = parseFloat(tail || '125')
  if (!Number.isFinite(bpm)) throw new Error(`Could not parse BPM from '${tail}'.`)

  const [instruments, patterns, sequence] = arrays.map((s, idx) => {
    const normalized = normalizeJsArrayLiteral(s)
    try {
      return JSON.parse(normalized)
    } catch (e) {
      throw new Error(
        `Failed to JSON.parse argument ${idx + 1}: ${(e as Error).message}\nNormalized: ${normalized.slice(0, 200)}`
      )
    }
  }) as [number[][], number[][][], number[]]

  return { instruments, patterns, sequence, bpm }
}

function validateShape(parsed: ReturnType<typeof parseZzfxmSnippet>): string | null {
  const { instruments, patterns, sequence, bpm } = parsed
  if (!Array.isArray(instruments) || instruments.length === 0) return 'instruments must be a non-empty array.'
  for (const ins of instruments) {
    if (!Array.isArray(ins)) return 'every instrument must be an array.'
    // Holes/nulls are valid — they correspond to elided zzfx default params.
    for (const v of ins) {
      if (v !== null && typeof v !== 'number') return 'instrument values must be numbers or null (for default param).'
    }
  }
  if (!Array.isArray(patterns) || patterns.length === 0) return 'patterns must be a non-empty array.'
  for (const p of patterns) {
    if (!Array.isArray(p)) return 'every pattern must be an array of channels.'
    for (const ch of p) {
      if (!Array.isArray(ch)) return 'every channel must be an array.'
    }
  }
  if (!Array.isArray(sequence)) return 'sequence must be an array of pattern indices.'
  for (const n of sequence) if (!Number.isInteger(n)) return 'sequence values must be integer pattern indices.'
  if (!Number.isFinite(bpm) || bpm <= 0) return 'BPM must be a positive number.'
  return null
}

function loadLibrary(): TracksLibrary {
  if (!existsSync(TRACKS_PATH)) return { version: 1, tracks: [] }
  try {
    return JSON.parse(readFileSync(TRACKS_PATH, 'utf-8')) as TracksLibrary
  } catch {
    return { version: 1, tracks: [] }
  }
}

function saveLibrary(lib: TracksLibrary): void {
  mkdirSync(dirname(TRACKS_PATH), { recursive: true })
  writeFileSync(TRACKS_PATH, JSON.stringify(lib, null, 2) + '\n', 'utf-8')
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

async function readSnippet(args: Args): Promise<string> {
  if (args.file) return readFileSync(args.file, 'utf-8')
  // stdin mode — read until EOF
  console.error('Paste your zzfxm(...) snippet, then press Ctrl-D:')
  const chunks: Buffer[] = []
  for await (const chunk of input) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf-8')
}

async function prompt(rl: ReturnType<typeof createInterface>, q: string, fallback?: string): Promise<string> {
  const ans = await rl.question(fallback ? `${q} [${fallback}]: ` : `${q}: `)
  return ans.trim() || fallback || ''
}

/** Return a readable stream the prompts should read from. When stdin is
 * a TTY, that's stdin itself. When stdin was piped (e.g., `pbpaste |
 * pnpm tracks:add`), stdin is at EOF and readline can't prompt — open
 * the terminal directly via `/dev/tty` so prompts still work after the
 * pipe has been consumed. Falls back to stdin if /dev/tty is unavailable
 * (won't happen on macOS/Linux; Windows would need different handling). */
function getPromptInput(): Readable {
  if (input.isTTY) return input as unknown as Readable
  try {
    const fd = openSync('/dev/tty', 'r')
    return createReadStream('', { fd })
  } catch {
    return input as unknown as Readable
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const snippet = await readSnippet(args)
  const parsed = parseZzfxmSnippet(snippet)
  const shapeErr = validateShape(parsed)
  if (shapeErr) {
    console.error(`Error: ${shapeErr}`)
    process.exitCode = 1
    return
  }

  // Auto-fill from the `// @zzfx-studio {json}` metadata comment that
  // ZzFX Studio's Export Code / Export JS includes. `config.name` is
  // the DAW's auto-generated song title (e.g., "The Frozen Undercroft").
  // `config.vibe` maps to a gem. With this metadata present, the only
  // user input required is the snippet itself.
  const meta = extractZzfxStudioMetadata(snippet)
  const metaName = meta?.config?.name
  const metaVibe = meta?.config?.vibe
  const metaGem = metaVibe ? VIBE_TO_GEM[metaVibe] : undefined

  let title = args.title ?? metaName
  let id = args.id ?? (title ? slugify(title) : undefined)
  let gem = args.gem ?? metaGem
  let credit = args.credit ?? 'zzfx-studio'

  if (!title || !id || !gem) {
    const rl = createInterface({ input: getPromptInput(), output })
    title = title || (await prompt(rl, 'Track title'))
    if (!title) {
      console.error('Title is required.')
      rl.close()
      process.exitCode = 1
      return
    }
    id = id || (await prompt(rl, 'Track id', slugify(title)))
    const gemStr = gem || ((await prompt(rl, `Gem (${GEM_VALUES.join('|')})`, 'amethyst')) as Gem)
    if (!GEM_VALUES.includes(gemStr as Gem)) {
      console.error(`Invalid gem '${gemStr}'. Valid: ${GEM_VALUES.join(', ')}`)
      rl.close()
      process.exitCode = 1
      return
    }
    gem = gemStr as Gem
    credit = args.credit ?? (await prompt(rl, 'Credit', credit))
    rl.close()
  }

  // Credit URL defaulting: when the credit is the canonical
  // "zzfx-studio" and the user didn't supply a URL, omit the field
  // entirely. The player resolves the default at render time, which
  // means a future ZzFX Studio URL change only needs an update in the
  // player component — existing tracks.json doesn't have to migrate.
  let creditUrl = args.creditUrl
  if (!creditUrl && credit && credit !== 'zzfx-studio') {
    // Non-default credit without a URL → leave undefined; player
    // renders as plain text. User can re-run with --credit-url to
    // attach a link.
  } else if (!creditUrl && credit === 'zzfx-studio') {
    // Default URL is handled by the player; don't write to JSON to
    // avoid stale-link risk.
    creditUrl = undefined
  }
  // Touch the constant so the import isn't dead — also lets us hint
  // the default to anyone reading this script.
  void ZZFX_STUDIO_URL

  const track: Track = {
    id: id!,
    title: title!,
    credit: credit || undefined,
    creditUrl,
    gem: gem!,
    bpm: parsed.bpm,
    instruments: parsed.instruments,
    patterns: parsed.patterns,
    sequence: parsed.sequence,
  }

  const lib = loadLibrary()
  const existingIdx = lib.tracks.findIndex((t) => t.id === track.id)
  if (existingIdx >= 0 && !args.force) {
    console.error(`Track with id '${track.id}' already exists. Use --force to overwrite.`)
    process.exitCode = 1
    return
  }
  if (existingIdx >= 0) lib.tracks[existingIdx] = track
  else lib.tracks.push(track)

  saveLibrary(lib)
  console.error(
    `${existingIdx >= 0 ? 'Updated' : 'Added'} '${track.id}' (${track.title}, gem=${track.gem}, bpm=${track.bpm}). Library now has ${lib.tracks.length} track(s).`
  )
}

main()
  .catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
  // Explicit exit — the /dev/tty fallback in getPromptInput() opens a
  // file descriptor that Node won't auto-close at end of main, which
  // otherwise hangs the process. Force termination once the work is done.
  .finally(() => process.exit(process.exitCode ?? 0))
