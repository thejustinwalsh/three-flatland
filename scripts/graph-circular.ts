// Run `madge --circular` only on the workspace dirs that actually exist.
// Branches without tools/ (the canonical case on lighting-stochastic-adoption)
// otherwise crash on ENOENT.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const targets = ['packages', 'minis', 'tools'].filter((d) => existsSync(d))

try {
  execFileSync('madge', ['--circular', ...targets], { stdio: 'inherit' })
} catch {
  process.exit(1)
}
