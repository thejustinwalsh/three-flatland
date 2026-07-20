#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
import * as prompts from '@clack/prompts'
import pc from 'picocolors'
import { formatTargetDir, isValidPackageName, scaffold, TEMPLATES, toValidPackageName } from './scaffold'

type Template = (typeof TEMPLATES)[number]

const HELP = `create-three-flatland — scaffold a three-flatland project

Usage: create-three-flatland [TARGET_DIR] [--template three|react] [--overwrite]

Options:
  -t, --template <name>   Template to use: ${TEMPLATES.join(' | ')}
  --overwrite             Empty a non-empty target directory (preserves .git)
  -h, --help              Show this help`

function isTemplate(value: string | undefined): value is Template {
  return value !== undefined && (TEMPLATES as readonly string[]).includes(value)
}

function pkgManagerFromUserAgent(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'
  return 'npm'
}

function cancelled(): number {
  prompts.cancel('Cancelled.')
  return 1
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      template: { type: 'string', short: 't' },
      overwrite: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log(HELP)
    return 0
  }

  let targetDir = positionals[0] ? formatTargetDir(positionals[0]) : undefined
  let template: string | undefined = values.template

  // Vite interop contract: fully non-interactive when target dir + a valid template are both supplied.
  const interactive = targetDir === undefined || !isTemplate(template)

  if (interactive) {
    prompts.intro(pc.bold('create-three-flatland'))
    if (targetDir === undefined) {
      const answer = await prompts.text({
        message: 'Project name:',
        placeholder: 'my-flatland-game',
        defaultValue: 'my-flatland-game',
      })
      if (prompts.isCancel(answer)) return cancelled()
      targetDir = formatTargetDir(answer)
    }
    if (!isTemplate(template)) {
      if (template !== undefined) {
        prompts.log.warn(`"${template}" is not a valid template`)
      }
      const answer = await prompts.select<Template>({
        message: 'Select a template:',
        options: [
          { value: 'three', label: 'three.js', hint: 'plain Vite + three-flatland' },
          { value: 'react', label: 'React', hint: 'React Three Fiber + three-flatland' },
        ],
      })
      if (prompts.isCancel(answer)) return cancelled()
      template = answer
    }
  }

  if (!isTemplate(template)) {
    console.error(`Unknown template "${template}" (expected one of: ${TEMPLATES.join(', ')})`)
    return 1
  }

  const root = resolve(targetDir!)
  let packageName = basename(root)
  if (!isValidPackageName(packageName)) {
    if (interactive) {
      const answer = await prompts.text({
        message: 'Package name:',
        defaultValue: toValidPackageName(packageName),
        validate: (v) => (isValidPackageName(v) ? undefined : 'Invalid package.json name'),
      })
      if (prompts.isCancel(answer)) return cancelled()
      packageName = answer
    } else {
      packageName = toValidPackageName(packageName)
    }
  }

  let overwrite = values.overwrite ?? false
  let ignoreExisting = false
  if (interactive && !overwrite && existsSync(root) && readdirSync(root).some((f) => f !== '.git')) {
    const answer = await prompts.select<'cancel' | 'overwrite' | 'ignore'>({
      message: `Target directory "${targetDir}" is not empty. How should we proceed?`,
      options: [
        { value: 'cancel', label: 'Cancel' },
        { value: 'overwrite', label: 'Remove existing files and continue' },
        { value: 'ignore', label: 'Ignore files and continue' },
      ],
    })
    if (prompts.isCancel(answer) || answer === 'cancel') return cancelled()
    overwrite = answer === 'overwrite'
    ignoreExisting = answer === 'ignore'
  }

  const templatesRoot = fileURLToPath(new URL('../templates', import.meta.url))
  const result = scaffold({ targetDir: root, template, packageName, overwrite, ignoreExisting, templatesRoot })

  const pm = pkgManagerFromUserAgent()
  const cd = relative(process.cwd(), result.root)
  const lines = [`cd ${cd}`, pm === 'yarn' ? 'yarn' : `${pm} install`, pm === 'npm' ? 'npm run dev' : `${pm} dev`]
  if (interactive) {
    prompts.outro(`Done. Now run:\n\n${lines.map((l) => `  ${l}`).join('\n')}`)
  } else {
    console.log(`\nScaffolded ${template} template in ${result.root}\n\n${lines.map((l) => `  ${l}`).join('\n')}\n`)
  }
  return 0
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exit(1)
  }
)
