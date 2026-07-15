#!/usr/bin/env node

/**
 * `uikit-bake` — uikit's own bake CLI (D3 ruling: "uikit can be used
 * standalone, so it gets a bin, someone may not use the others. slug
 * surfaces its own bake, so should uikit, even if it just proxies it to
 * slug." A consumer of `@three-flatland/uikit` never needs to learn
 * `@three-flatland/slug`'s CLI.).
 *
 * Runnable two ways:
 *   - `uikit-bake <subcommand> [args]` (or `node dist/cli.js ...`) — the
 *     standalone bin.
 *   - `flatland-bake uikit <subcommand> [args]` — via the unified
 *     `@three-flatland/bake` dispatcher. Registered under the baker name
 *     **`uikit`**, not `font` — `@three-flatland/slug` already owns `font`
 *     and `discoverBakers()` warns (and drops the loser) on a name
 *     collision.
 *
 * Subcommands:
 *   font <ttf|otf> [options]   Proxies slug's exported `font` baker
 *                              directly (no subprocess) — see
 *                              `resolveSlugBaker` below.
 *   icons <svg...|svg-dir> -o <out.glb>
 *   icons --manifest <file.json>
 *                              Parses SVGs via `@three-flatland/slug/svg`,
 *                              registers them into one `SlugShapeSet`, and
 *                              serializes it with `packShapeSet` from
 *                              `@three-flatland/slug/bake`. The manifest
 *                              form reads a declarative bake config instead
 *                              of positional args — see `ICONS_USAGE`.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { Baker } from '@three-flatland/bake'
import type { Window as HappyDomWindow } from 'happy-dom'
import { SlugShapeSet } from '@three-flatland/slug'
import type { BakedIconEntry } from '@three-flatland/slug'
import { loadSVGShapes } from '@three-flatland/slug/svg'
import { packShapeSet } from '@three-flatland/slug/bake'

// --- headless DOMParser shim ---
//
// `slug/svg`'s `parseSVG` runs three's `SVGLoader.parse`, which needs a
// `DOMParser` global — present in browsers, absent in plain Node. Same
// shim as `packages/slug/src/svg/parseSVG.lucide.test.ts` (happy-dom's
// `CSSStyleDeclaration` reads `undefined` for an unset property where a
// browser reads `''`, which crashes `SVGLoader`'s style scraping) —
// duplicated here rather than imported because that module lives under
// slug's `src/**/*.test.ts`, which never ships in slug's `dist`.

interface StylePatchable {
  style?: object
  children?: Iterable<StylePatchable>
}

function patchStyles(el: StylePatchable): void {
  const style = el.style
  if (style) {
    Object.defineProperty(el, 'style', {
      value: new Proxy(style, {
        get: (target, prop) => {
          const v = Reflect.get(target, prop)
          return v === undefined && typeof prop === 'string' ? '' : v
        },
      }),
    })
  }
  for (const child of el.children ?? []) patchStyles(child)
}

/**
 * Install a headless `DOMParser` global; returns a function that restores whatever
 * (if anything) was previously installed.
 *
 * `happy-dom` is loaded lazily and declared optional: it weighs ~17 MB and is needed
 * only by `icons` (three's `SVGLoader` requires a DOM). `font` proxies Slug's baker and
 * needs no DOM at all, so a top-level import would tax every consumer of a browser UI
 * library for a subcommand most never run.
 */
async function installDomParserShim(): Promise<() => void> {
  let Window: typeof HappyDomWindow
  try {
    ;({ Window } = await import('happy-dom'))
  } catch {
    throw new Error(
      "uikit-bake icons needs a headless DOM (three's SVGLoader requires DOMParser).\n" +
        'Install the optional peer:  pnpm add -D happy-dom'
    )
  }
  const win = new Window()
  class ShimDOMParser {
    parseFromString(text: string, type: string): Document {
      const doc = new win.DOMParser().parseFromString(text, type as 'image/svg+xml')
      if (doc.documentElement) patchStyles(doc.documentElement as unknown as StylePatchable)
      return doc as unknown as Document
    }
  }
  const g = globalThis as { DOMParser?: unknown }
  const previous = g.DOMParser
  g.DOMParser = ShimDOMParser
  return () => {
    g.DOMParser = previous
  }
}

const USAGE = `Usage: uikit-bake <subcommand> [args]
  (also: flatland-bake uikit <subcommand> [args])

Subcommands:
  font <ttf|otf> [options]     Bake SlugFont data (.slug.glb) from a
                                TTF/OTF font. Proxies slug's own \`font\`
                                baker directly — run
                                \`uikit-bake font --help\` for its options.

  icons <svg...|svg-dir> -o <out.glb>
  icons --manifest <file.json> Bake a set of SVG icons into a single
                                \`FL_slug_shapes\` .glb, loadable via
                                \`SlugShapeSet.fromBaked\`. The manifest form
                                reads a checked-in declarative bake config.

Run \`uikit-bake <subcommand> --help\` for subcommand-specific usage.`

const ICONS_USAGE = `Usage: uikit-bake icons <svg...|svg-dir> [options]
  (also: flatland-bake uikit icons <svg...|svg-dir> [options])
  (manifest form: uikit-bake icons --manifest <file.json>)

Parses each SVG through @three-flatland/slug/svg, registers its shapes into
one shared SlugShapeSet (so every icon shares a single curve/band texture
pair — one future draw call), and serializes the set with packShapeSet.

Arguments:
  <svg...|svg-dir>   One or more .svg files, and/or directories to scan
                      (non-recursive) for .svg files.

Options:
  --output, -o <path>    Output .glb path. Default: icons.glb in the
                         current directory. Mutually exclusive with
                         --manifest (the manifest declares its own "out").
  --manifest <file.json> Bake from a declarative manifest instead of
                         positional arguments — see "Manifest form" below.
                         Mutually exclusive with positional args and
                         --output/-o.

Determinism: all collected files (positional files plus every directory's
entries) are sorted by basename, then full path, before registering — shape
ids are stable across re-bakes of the same input set. Two inputs that
resolve to the same icon name (filename without extension) is a hard error;
rename one of the files.

Each icon's name, per-shape fill data, and source viewBox is carried in the
output's \`meta\` field as \`meta.icons[name] = { handles, fills, viewBox }\`
(viewBox: minX/minY/width/height), so SlugShapeSet.fromBaked callers can
look shapes up by name — via @three-flatland/slug's \`iconFromBaked\` —
instead of raw handle id.

Manifest form:
  A checked-in JSON file so a project's icon set re-bakes deterministically
  without a long invocation — the "bake config" analogue of a tsconfig.
  "out" and every source "path" resolve relative to the MANIFEST FILE's own
  directory, not the current working directory.

    {
      "out": "public/icons.shapes.glb",
      "sources": [
        "../uikit-lucide/icons/activity.svg",
        { "path": "../uikit-lucide/icons/circle.svg", "name": "circle-icon" },
        { "path": "./custom-icons", "fillRule": "evenodd" }
      ],
      "meta": { "version": 1 }
    }

  sources[*] is a bare path (file or non-recursively-scanned dir, same
  semantics as positional args) or an object: "name" overrides the
  basename-derived icon id (single-file paths only — a directory expanding
  to more than one file with "name" set is an error), "fillRule" forces
  every path parsed from that source to the given rule. Ordering and the
  duplicate-name hard error apply to the RESOLVED name (override, else
  basename) — the same D6 determinism guarantee, extended to overrides.
  "meta" merges into the baked set's meta alongside the computed "icons"
  map (a manifest "meta.icons" is shadowed by the computed one).

What to bake:
  Bake a FIXED, KNOWN icon set through this CLI (manifest or positional) —
  it collapses every baked icon onto one shared curve/band texture pair AND
  removes runtime SVG parsing for those icons (SlugShapeSetLoader plus
  slug's iconFromBaked resolve them by name with zero DOM work).
  Runtime-parse DYNAMIC or user-supplied SVGs instead
  (@three-flatland/slug/svg's loadSVGShapes) — they still register into the
  SAME shared SlugShapeSet as baked icons and batch identically; baking
  buys zero-parse-cost and reproducibility on top, not batching alone (one
  shared set is what enables batching either way).
  Tradeoff: a larger atlas trades bigger startup download / GPU texture
  memory for fewer draws and no parse cost — bake the icons an app actually
  ships, not an entire icon library; a growing icon set re-bakes and
  repacks rather than shipping unused shapes.`

// --- font subcommand: proxy slug's exported Baker, no subprocess ---

/**
 * Resolve slug's compiled `cli.js` on disk via `require.resolve` against
 * the `@three-flatland/slug` package specifier (which slug's package.json
 * `exports` map DOES cover), then derive the sibling `cli.js` path from
 * the resolved directory. Avoids needing a `./cli` subpath export on
 * slug's `exports` map — the CLI stays an internal implementation detail
 * of slug, reached here as a plain file dynamic `import()`, exactly like
 * `flatland-bake`'s own `loadBaker` does for every registered baker.
 */
async function resolveSlugBaker(): Promise<Baker> {
  const require = createRequire(import.meta.url)
  const slugEntry = require.resolve('@three-flatland/slug')
  const cliPath = join(dirname(slugEntry), 'cli.js')
  const mod = (await import(pathToFileURL(cliPath).href)) as { default?: Baker }
  if (!mod.default || typeof mod.default.run !== 'function') {
    throw new Error(
      `uikit-bake: @three-flatland/slug's cli.js at ${cliPath} did not default-export a Baker`
    )
  }
  return mod.default
}

async function runFont(args: string[]): Promise<number> {
  const slugBaker = await resolveSlugBaker()
  return slugBaker.run(args)
}

// --- icons subcommand ---

/** Ascending compare: basename first, then full path — D6 determinism. */
function compareByBasenameThenPath(a: string, b: string): number {
  const ba = basename(a)
  const bb = basename(b)
  if (ba !== bb) return ba < bb ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Expand one resolved input to `.svg` files: itself if a file, else a non-recursive directory scan. */
function expandSvgInput(resolved: string): string[] {
  const st = statSync(resolved)
  if (!st.isDirectory()) return [resolved]
  const files: string[] = []
  for (const entry of readdirSync(resolved)) {
    if (extname(entry).toLowerCase() === '.svg') files.push(join(resolved, entry))
  }
  return files
}

/**
 * Resolve inputs (files and/or non-recursively scanned directories) to a
 * `.svg` file list sorted by basename then full path, so shape ids come out
 * stable across re-bakes of the same input set (D6). Throws when two
 * different paths resolve to the same icon name (filename without
 * extension) — a silent `meta.icons` collision otherwise.
 */
function collectSvgFiles(inputs: string[]): string[] {
  const files = inputs.flatMap((input) => expandSvgInput(resolve(input)))
  files.sort(compareByBasenameThenPath)

  const byName = new Map<string, string>()
  for (const file of files) {
    const name = basename(file, extname(file))
    const existing = byName.get(name)
    if (existing !== undefined && existing !== file) {
      throw new Error(
        `uikit-bake icons: duplicate icon name "${name}" from both "${existing}" and "${file}"`
      )
    }
    byName.set(name, file)
  }

  return files
}

// --- icons subcommand: --manifest form ---

/** One `sources` entry with per-icon overrides (a bare string source skips these). */
interface IconBakeManifestSource {
  path: string
  name?: string
  fillRule?: 'nonzero' | 'evenodd'
}

/**
 * Declarative bake config for `icons --manifest <file.json>` — checked into
 * source so a project's icon set re-bakes deterministically without a long
 * CLI invocation. `out` and every `sources[*].path` resolve relative to the
 * MANIFEST FILE's own directory (tsconfig-`include` style), not `cwd`.
 */
interface IconBakeManifest {
  out: string
  sources: Array<string | IconBakeManifestSource>
  meta?: Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Hand-validate a parsed manifest (no schema-validation dependency — U10
 * DO-NOT list). Throws an `Error` naming the first offending field.
 */
function validateManifest(value: unknown): IconBakeManifest {
  if (!isPlainObject(value)) {
    throw new Error('manifest: root must be a JSON object')
  }

  const out = value.out
  if (typeof out !== 'string' || out.length === 0) {
    throw new Error('manifest.out must be a non-empty string')
  }

  const sources = value.sources
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('manifest.sources must be a non-empty array')
  }
  sources.forEach((source: unknown, i) => {
    if (typeof source === 'string') {
      if (source.length === 0) {
        throw new Error(`manifest.sources[${i}] must be a non-empty string or object`)
      }
      return
    }
    if (!isPlainObject(source)) {
      throw new Error(`manifest.sources[${i}] must be a string or an object`)
    }
    if (typeof source.path !== 'string' || source.path.length === 0) {
      throw new Error(`manifest.sources[${i}].path must be a non-empty string`)
    }
    if (
      source.name !== undefined &&
      (typeof source.name !== 'string' || source.name.length === 0)
    ) {
      throw new Error(`manifest.sources[${i}].name must be a non-empty string`)
    }
    if (
      source.fillRule !== undefined &&
      source.fillRule !== 'nonzero' &&
      source.fillRule !== 'evenodd'
    ) {
      throw new Error(`manifest.sources[${i}].fillRule must be "nonzero" or "evenodd"`)
    }
  })

  const meta = value.meta
  if (meta !== undefined && !isPlainObject(meta)) {
    throw new Error('manifest.meta must be an object')
  }

  return value as unknown as IconBakeManifest
}

/** One resolved manifest icon: source file, resolved name, optional fill-rule override. */
interface ManifestSourceEntry {
  file: string
  name: string
  fillRule?: 'nonzero' | 'evenodd'
}

/**
 * Resolve manifest `sources` into per-icon entries against `manifestDir`:
 * expand each `path` the same way `collectSvgFiles` does (file or
 * non-recursive directory scan), apply `name`/`fillRule` overrides, then
 * order + dedupe by the RESOLVED icon name (override `name` if given, else
 * basename) — extending D6 determinism to overrides.
 */
function resolveManifestSources(
  manifest: IconBakeManifest,
  manifestDir: string
): ManifestSourceEntry[] {
  const entries: ManifestSourceEntry[] = []
  manifest.sources.forEach((source, i) => {
    const path = typeof source === 'string' ? source : source.path
    const nameOverride = typeof source === 'string' ? undefined : source.name
    const fillRule = typeof source === 'string' ? undefined : source.fillRule
    const files = expandSvgInput(resolve(manifestDir, path))
    if (files.length === 0) {
      throw new Error(`manifest.sources[${i}]: no .svg files found at "${path}"`)
    }
    if (nameOverride !== undefined && files.length > 1) {
      throw new Error(
        `manifest.sources[${i}].name is only valid for a single .svg file, but "${path}" resolved to ${files.length} files`
      )
    }
    for (const file of files) {
      entries.push({ file, name: nameOverride ?? basename(file, extname(file)), fillRule })
    }
  })

  entries.sort((a, b) =>
    a.name === b.name ? compareByBasenameThenPath(a.file, b.file) : a.name < b.name ? -1 : 1
  )

  const byName = new Map<string, string>()
  for (const entry of entries) {
    const existing = byName.get(entry.name)
    if (existing !== undefined && existing !== entry.file) {
      throw new Error(
        `manifest: duplicate icon name "${entry.name}" from both "${existing}" and "${entry.file}"`
      )
    }
    byName.set(entry.name, entry.file)
  }

  return entries
}

/**
 * Parse + register `entries` into one `SlugShapeSet` and pack it — the
 * shared bake loop for both the positional and `--manifest` `icons` paths,
 * so their output is byte-identical whenever neither uses a manifest-only
 * feature (`name`/`fillRule` overrides, extra `meta`).
 */
async function bakeIcons(
  entries: ManifestSourceEntry[],
  extraMeta: Record<string, unknown> | undefined
): Promise<Uint8Array> {
  const set = new SlugShapeSet()
  const icons: Record<string, BakedIconEntry> = {}

  const restoreDomParser = await installDomParserShim()
  try {
    for (const entry of entries) {
      const svgText = readFileSync(entry.file, 'utf8')
      const registered = await loadSVGShapes(svgText, set)
      icons[entry.name] = {
        handles: registered.handles.map((h) => h.glyphId),
        fills: registered.fills.map((f) => ({
          color: { ...f.color },
          rule: entry.fillRule ?? f.rule,
        })),
        viewBox: { ...registered.viewBox },
      }
      console.log(`  ${entry.name}: ${registered.handles.length} shape(s)`)
    }
  } finally {
    restoreDomParser()
  }

  console.log(`Packing ${set.shapeCount} shape(s) from ${entries.length} icon(s)...`)
  return packShapeSet(set, extraMeta ? { ...extraMeta, icons } : { icons })
}

async function runIcons(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(ICONS_USAGE + '\n')
    return args.length === 0 ? 1 : 0
  }

  const inputs: string[] = []
  let output: string | undefined
  let manifestArg: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      i++
      if (i >= args.length) {
        console.error('--output requires a value')
        return 1
      }
      output = args[i]!
    } else if (args[i] === '--manifest') {
      i++
      if (i >= args.length) {
        console.error('--manifest requires a value')
        return 1
      }
      manifestArg = args[i]!
    } else {
      inputs.push(args[i]!)
    }
  }

  if (manifestArg !== undefined) {
    if (inputs.length > 0 || output !== undefined) {
      console.error(
        'uikit-bake icons: --manifest is mutually exclusive with positional <svg...|svg-dir> ' +
          'arguments and --output/-o — the manifest declares its own "sources" and "out".'
      )
      return 1
    }
    return runIconsFromManifest(manifestArg)
  }

  if (inputs.length === 0) {
    console.error('No SVG files or directories specified. Use --help for usage.')
    return 1
  }

  let svgFiles: string[]
  try {
    svgFiles = collectSvgFiles(inputs)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return 1
  }
  if (svgFiles.length === 0) {
    console.error('No .svg files found in the given inputs.')
    return 1
  }

  const entries: ManifestSourceEntry[] = svgFiles.map((file) => ({
    file,
    name: basename(file, extname(file)),
  }))
  const glb = await bakeIcons(entries, undefined)
  const resolvedOutput = output ?? 'icons.glb'
  writeFileSync(resolvedOutput, glb)

  const glbKB = (glb.byteLength / 1024).toFixed(2)
  console.log(`  ${resolvedOutput} (${glbKB} KB)`)
  return 0
}

/** `icons --manifest <file.json>` — read, validate, resolve sources, bake. */
async function runIconsFromManifest(manifestArg: string): Promise<number> {
  const manifestPath = resolve(manifestArg)

  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch (err) {
    console.error(
      `uikit-bake icons --manifest: cannot read "${manifestPath}": ${err instanceof Error ? err.message : String(err)}`
    )
    return 1
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(
      `uikit-bake icons --manifest: invalid JSON in "${manifestPath}": ${err instanceof Error ? err.message : String(err)}`
    )
    return 1
  }

  let manifest: IconBakeManifest
  let entries: ManifestSourceEntry[]
  try {
    manifest = validateManifest(parsed)
    entries = resolveManifestSources(manifest, dirname(manifestPath))
  } catch (err) {
    console.error(
      `uikit-bake icons --manifest: ${err instanceof Error ? err.message : String(err)}`
    )
    return 1
  }

  const glb = await bakeIcons(entries, manifest.meta)
  const output = resolve(dirname(manifestPath), manifest.out)
  writeFileSync(output, glb)

  const glbKB = (glb.byteLength / 1024).toFixed(2)
  console.log(`  ${output} (${glbKB} KB)`)
  return 0
}

// --- dispatch ---

async function run(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(USAGE + '\n')
    return subcommand ? 0 : 1
  }

  if (subcommand === 'font') return runFont(rest)
  if (subcommand === 'icons') return runIcons(rest)

  console.error(`uikit-bake: unknown subcommand "${subcommand}". Use --help for usage.`)
  return 1
}

/**
 * `@three-flatland/bake` baker contract — registered under the name
 * `uikit` (not `font`; slug already owns that name) in this package's
 * `flatland.bake` field, so `flatland-bake uikit <subcommand> ...` reaches
 * the same dispatch the `uikit-bake` bin uses below.
 */
const baker: Baker = {
  name: 'uikit',
  description: 'Bake uikit assets: fonts (proxies slug) and SVG icon shape-sets',
  usage() {
    return USAGE
  },
  run,
}

export default baker

// Thin bin wrapper: only self-invoke when this module is the process
// entry point (`uikit-bake` / `node dist/cli.js`), not when `flatland-bake`
// dynamically imports it purely to read the default export.
const isMain =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  baker.run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err)
      process.exit(1)
    }
  )
}
