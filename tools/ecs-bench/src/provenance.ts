import { execFileSync } from 'node:child_process'

export function gitMergeBase(): string {
  try {
    return (
      execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5_000,
      }).trim() || 'unknown'
    )
  } catch {
    return 'unknown'
  }
}
