// Resolves an `audio.file` finding's `payload.path` (a string as written
// in source — may be relative, and the sidecar never validates it exists
// on disk, tools/codelens-service/CLAUDE.md) to a real absolute path, or
// `undefined` if it doesn't resolve anywhere — in which case the CodeLens
// itself must not appear (see provider.ts). Resolution order: (1) the
// source file's own directory, (2) the workspace root, (3) `public/`
// under the workspace root — first candidate that exists on disk wins.
//
// `exists` is injected (defaults to `fs.existsSync`) so this stays
// unit-testable without touching the real filesystem; `path` is Node's
// builtin (no `vscode` dependency), so — like `numberArrayLiteral.ts` —
// this file has no module-scope `vscode` import and runs under plain
// vitest.
import * as fs from 'node:fs'
import * as path from 'node:path'

export function audioFileCandidates(
  refPath: string,
  sourceDir: string,
  workspaceRoot: string
): string[] {
  return [
    path.resolve(sourceDir, refPath),
    path.resolve(workspaceRoot, refPath),
    path.resolve(workspaceRoot, 'public', refPath),
  ]
}

export function resolveAudioFilePath(
  refPath: string,
  sourceDir: string,
  workspaceRoot: string,
  exists: (p: string) => boolean = fs.existsSync
): string | undefined {
  return audioFileCandidates(refPath, sourceDir, workspaceRoot).find(exists)
}
