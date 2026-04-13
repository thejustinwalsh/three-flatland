#!/usr/bin/env tsx
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const skillsDir = join(process.cwd(), process.argv[2] ?? 'skills')

type Issue = { skill: string; message: string }
const issues: Issue[] = []

function parseFrontmatter(md: string): Record<string, string> {
  const match = md.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const out: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

for (const entry of readdirSync(skillsDir)) {
  const skillPath = join(skillsDir, entry)
  if (!statSync(skillPath).isDirectory()) continue
  if (entry.startsWith('.') || entry === 'node_modules') continue

  const skillMdPath = join(skillPath, 'SKILL.md')
  let content: string
  try {
    content = readFileSync(skillMdPath, 'utf8')
  } catch {
    issues.push({ skill: entry, message: 'missing SKILL.md' })
    continue
  }

  const fm = parseFrontmatter(content)
  if (!fm.name) issues.push({ skill: entry, message: 'frontmatter missing `name`' })
  if (fm.name && fm.name !== entry) {
    issues.push({ skill: entry, message: `frontmatter name "${fm.name}" does not match directory "${entry}"` })
  }
  if (!fm.description) {
    issues.push({ skill: entry, message: 'frontmatter missing `description`' })
  } else if (!/^use when\b/i.test(fm.description)) {
    issues.push({ skill: entry, message: `description must begin with "Use when…" (got: "${fm.description.slice(0, 60)}…")` })
  }
}

if (issues.length > 0) {
  console.error('Skill validation failed:')
  for (const { skill, message } of issues) console.error(`  [${skill}] ${message}`)
  process.exit(1)
}
console.log(`✓ validated ${readdirSync(skillsDir).filter(e => statSync(join(skillsDir, e)).isDirectory() && !e.startsWith('.')).length} skill(s)`)
