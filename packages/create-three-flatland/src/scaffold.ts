import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
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

/**
 * Refuse to write through an existing symlink. With "ignore files and continue"
 * on a non-empty target, a pre-existing `src` symlink would otherwise scatter
 * template files into whatever it points at, and a symlinked package.json would
 * be followed again during the name rewrite.
 */
function assertNotSymlink(path: string): void {
  let stats
  try {
    stats = lstatSync(path)
  } catch {
    return // does not exist — nothing to follow
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`refusing to write through symlink: ${path}`)
  }
}

function copyDir(src: string, dest: string, written: string[]): void {
  assertNotSymlink(dest)
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    if (SKIP_DIRS.has(entry)) continue
    const srcPath = join(src, entry)
    const destName = RENAME_FILES[entry] ?? entry
    const destPath = join(dest, destName)
    // lstat, not stat: a symlink inside the template would otherwise be
    // followed and could copy a tree from outside the template root.
    const srcStat = lstatSync(srcPath)
    if (srcStat.isSymbolicLink()) continue
    if (srcStat.isDirectory()) {
      copyDir(srcPath, destPath, written)
    } else {
      assertNotSymlink(destPath)
      copyFileSync(srcPath, destPath)
      written.push(destPath)
    }
  }
}

export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  // Enforce the invariant here rather than at each call site. An empty or
  // whitespace-only target resolves to process.cwd(), and with `overwrite` that
  // empties the user's current directory. The CLI screens its positional arg,
  // but the interactive prompt is a second entry point — this covers both, and
  // anything embedding scaffold() directly.
  if (options.targetDir.trim() === '') {
    throw new Error('target directory must not be empty')
  }
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
