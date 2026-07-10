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
 *                              Parses SVGs via `@three-flatland/slug/svg`,
 *                              registers them into one `SlugShapeSet`, and
 *                              serializes it with `packShapeSet` from
 *                              `@three-flatland/slug/bake`.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { Baker } from '@three-flatland/bake'
import type { Window as HappyDomWindow } from 'happy-dom'
import { SlugShapeSet } from '@three-flatland/slug'
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
                                Bake a set of SVG icons into a single
                                \`FL_slug_shapes\` .glb, loadable via
                                \`SlugShapeSet.fromBaked\`.

Run \`uikit-bake <subcommand> --help\` for subcommand-specific usage.`

const ICONS_USAGE = `Usage: uikit-bake icons <svg...|svg-dir> [options]
  (also: flatland-bake uikit icons <svg...|svg-dir> [options])

Parses each SVG through @three-flatland/slug/svg, registers its shapes into
one shared SlugShapeSet (so every icon shares a single curve/band texture
pair — one future draw call), and serializes the set with packShapeSet.

Arguments:
  <svg...|svg-dir>   One or more .svg files, and/or directories to scan
                      (non-recursive) for .svg files.

Options:
  --output, -o <path>   Output .glb path. Default: icons.glb in the
                        current directory.

Each icon's name (its filename without extension) and per-shape fill data
is carried in the output's \`meta\` field, so SlugShapeSet.fromBaked callers
can look shapes up by name instead of raw handle id.`

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

function collectSvgFiles(inputs: string[]): string[] {
  const files: string[] = []
  for (const input of inputs) {
    const resolved = resolve(input)
    const st = statSync(resolved)
    if (st.isDirectory()) {
      for (const entry of readdirSync(resolved)) {
        if (extname(entry).toLowerCase() === '.svg') {
          files.push(join(resolved, entry))
        }
      }
    } else {
      files.push(resolved)
    }
  }
  return files
}

async function runIcons(args: string[]): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(ICONS_USAGE + '\n')
    return args.length === 0 ? 1 : 0
  }

  const inputs: string[] = []
  let output = 'icons.glb'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      i++
      if (i >= args.length) {
        console.error('--output requires a value')
        return 1
      }
      output = args[i]!
    } else {
      inputs.push(args[i]!)
    }
  }

  if (inputs.length === 0) {
    console.error('No SVG files or directories specified. Use --help for usage.')
    return 1
  }

  const svgFiles = collectSvgFiles(inputs)
  if (svgFiles.length === 0) {
    console.error('No .svg files found in the given inputs.')
    return 1
  }

  const set = new SlugShapeSet()
  const icons: Record<
    string,
    {
      handles: number[]
      fills: { color: { r: number; g: number; b: number; a: number }; rule: string }[]
    }
  > = {}

  const restoreDomParser = await installDomParserShim()
  try {
    for (const file of svgFiles) {
      const svgText = readFileSync(file, 'utf8')
      const name = basename(file, extname(file))
      const registered = await loadSVGShapes(svgText, set)
      icons[name] = {
        handles: registered.handles.map((h) => h.glyphId),
        fills: registered.fills.map((f) => ({ color: { ...f.color }, rule: f.rule })),
      }
      console.log(`  ${name}: ${registered.handles.length} shape(s)`)
    }
  } finally {
    restoreDomParser()
  }

  console.log(`Packing ${set.shapeCount} shape(s) from ${svgFiles.length} icon(s)...`)
  const glb = await packShapeSet(set, { icons })
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
