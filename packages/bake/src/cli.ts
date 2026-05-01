#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { discoverBakers } from './discovery.js'
import type { Baker, BakerRegistration } from './types.js'

const USAGE = `flatland-bake — unified bake entry point

Usage:
  flatland-bake <name> [args...]    Run a registered baker
  flatland-bake --list              List registered bakers
  flatland-bake --help              Show this usage

Bakers are contributed by packages via a \`flatland.bakers\` field in
package.json. Install a package that provides one (e.g. @three-flatland/slug)
and its subcommand will appear in --list.`

async function main(argv: string[]): Promise<number> {
  const [first, ...rest] = argv

  if (!first || first === '--help' || first === '-h') {
    process.stdout.write(USAGE + '\n')
    return 0
  }

  const { bakers, conflicts } = discoverBakers()
  for (const warning of conflicts) {
    process.stderr.write(`[flatland-bake] warn: ${warning}\n`)
  }

  if (first === '--list') {
    return printList(bakers)
  }

  const match = bakers.find((b) => b.name === first)
  if (!match) {
    process.stderr.write(
      `[flatland-bake] unknown baker "${first}". Run \`flatland-bake --list\` to see what's available.\n`
    )
    return 1
  }

  const baker = await loadBaker(match)
  if (!baker) return 1

  try {
    return await baker.run(rest)
  } catch (err) {
    process.stderr.write(
      `[flatland-bake] baker "${match.name}" threw: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return 1
  }
}

function printList(bakers: BakerRegistration[]): number {
  if (bakers.length === 0) {
    process.stdout.write(
      'No bakers registered. Install a package that contributes one (e.g. @three-flatland/slug).\n'
    )
    return 0
  }

  const nameWidth = Math.max(...bakers.map((b) => b.name.length))
  process.stdout.write('Registered bakers:\n')
  for (const b of bakers) {
    const pad = ' '.repeat(nameWidth - b.name.length)
    process.stdout.write(`  ${b.name}${pad}  ${b.description}  (${b.packageName})\n`)
  }
  return 0
}

async function loadBaker(reg: BakerRegistration): Promise<Baker | null> {
  if (!existsSync(reg.resolvedEntry)) {
    process.stderr.write(
      `[flatland-bake] baker "${reg.name}" from "${reg.packageName}" points to missing entry: ${reg.resolvedEntry}\n`
    )
    return null
  }

  const mod = (await import(pathToFileURL(reg.resolvedEntry).href)) as {
    default?: Baker
  }
  const baker = mod.default
  if (!baker || typeof baker.run !== 'function') {
    process.stderr.write(
      `[flatland-bake] baker "${reg.name}" from "${reg.packageName}" did not default-export a Baker.\n`
    )
    return null
  }
  return baker
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`[flatland-bake] fatal: ${String(err)}\n`)
    process.exit(1)
  }
)
