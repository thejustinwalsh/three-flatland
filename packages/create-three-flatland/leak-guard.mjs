/**
 * The leak guard: what must never reach a scaffolded project.
 *
 * Two consumers share this, and they check different things, which is why it
 * lives in one place rather than being copied:
 *   • packages/create-three-flatland/src/scaffold.test.ts — guards the templates
 *     as authored, against the local templates/ directory.
 *   • scripts/consumer-smoke.mjs — guards the project a consumer actually
 *     receives, after a real registry install of the published tarball.
 *
 * Plain .mjs with no dependencies so both a vitest suite and a bare node script
 * can import it without a build step.
 */

/**
 * Workspace-only wiring. Never legitimate in a scaffolded project, in any file —
 * each of these either breaks the project outside this monorepo or leaks
 * monorepo plumbing into a user's tree.
 */
export const BANNED_EVERYWHERE = [
  'catalog:',
  'workspace:*',
  'workspace:^',
  'customConditions',
  "conditions: ['source']",
  'TURBO_MFE_PORT',
  'FL_DEVTOOLS',
  'GemBackground',
]

/**
 * Packages deliberately excluded from the starter. These must not be
 * DEPENDENCIES, but prose may legitimately name them — AGENTS.md's package
 * routing map is required by the spec to list `@three-flatland/devtools`. So
 * this list is checked against package.json only, never against a file walk.
 */
export const BANNED_AS_DEPENDENCY = ['@three-flatland/devtools', 'tweakpane']
