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

  // Format FIRST, then decide whether a target was supplied. Testing the raw
  // positional here is a data-loss bug: formatTargetDir('/') strips the trailing
  // slash to '', which resolve() turns into process.cwd() — so `create … / --overwrite`
  // would empty the user's current directory instead of targeting root. Anything
  // that normalizes to empty (a lone '/', whitespace) counts as not supplied and
  // falls through to the prompt, which is also what create-vite does.
  const formattedTarget = positionals[0] !== undefined ? formatTargetDir(positionals[0]) : undefined
  let targetDir = formattedTarget === '' ? undefined : formattedTarget
  let template: string | undefined = values.template

  // Vite interop contract: fully non-interactive when a target dir and a template
  // are both supplied. An INVALID template must error, not open a picker — with
  // stdin closed that printed a selection UI and exited 0 without scaffolding.
  const interactive = targetDir === undefined || template === undefined

  if (interactive) {
    // Refuse to prompt without a TTY. @clack's prompts never settle on EOF, so a
    // piped/CI/redirected invocation would hang main() forever, drain the event
    // loop, and exit 0 having scaffolded nothing — a silent success. Fail loudly
    // with the flags that would have made this non-interactive instead.
    if (!process.stdin.isTTY) {
      const missing = [
        targetDir === undefined ? 'a target directory' : null,
        template === undefined ? '--template <three|react>' : null,
      ].filter(Boolean)
      console.error(
        `create-three-flatland needs ${missing.join(' and ')}, and stdin is not a TTY so it cannot prompt.\n` +
          `Run: create-three-flatland <target-dir> --template <three|react>`
      )
      return 1
    }
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
