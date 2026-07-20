import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

export interface ScaffoldOptions {
  targetDir: string
  template: 'three' | 'react'
  packageName: string
  overwrite?: boolean
  /** create-vite's "ignore files and continue" — copy over the top of an existing dir. */
  ignoreExisting?: boolean
  templatesRoot: string
}

export interface ScaffoldResult {
  root: string
  written: string[]
}

export const TEMPLATES = ['three', 'react'] as const

/** npm strips real dotfiles from tarballs — templates store them prefixed. */
const RENAME_FILES: Record<string, string> = {
  _gitignore: '.gitignore',
}

/** Workspace artifacts that must never reach a scaffolded project. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo'])

export function formatTargetDir(dir: string): string {
  return dir.trim().replace(/\/+$/g, '')
}

export function isValidPackageName(name: string): boolean {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(name)
}

export function toValidPackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

export function isEmptyDir(dir: string): boolean {
  const files = readdirSync(dir)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function emptyDir(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git') continue
    rmSync(join(dir, entry), { recursive: true, force: true })
  }
}

function copyDir(src: string, dest: string, written: string[]): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (SKIP_DIRS.has(entry)) continue
    const srcPath = join(src, entry)
    const destName = RENAME_FILES[entry] ?? entry
    const destPath = join(dest, destName)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, written)
    } else {
      copyFileSync(srcPath, destPath)
      written.push(destPath)
    }
  }
}

export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const root = resolve(options.targetDir)
  const templateDir = join(options.templatesRoot, options.template)
  if (!existsSync(templateDir)) {
    throw new Error(`unknown template "${options.template}" (expected one of: ${TEMPLATES.join(', ')})`)
  }

  if (existsSync(root)) {
    if (!isEmptyDir(root) && !options.ignoreExisting) {
      if (!options.overwrite) throw new Error(`target directory "${root}" is not empty`)
      emptyDir(root)
    }
  } else {
    mkdirSync(root, { recursive: true })
  }

  const written: string[] = []
  copyDir(templateDir, root, written)

  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
  pkg.name = options.packageName
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  return { root, written }
}
