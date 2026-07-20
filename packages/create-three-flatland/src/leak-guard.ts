/** Strings that must never reach a scaffolded project. Shared by scaffold.test.ts and consumer-smoke.mjs. */

/** Workspace-only wiring. Never legitimate in any scaffolded file. */
export const BANNED_EVERYWHERE: readonly string[] = [
  'catalog:',
  'workspace:*',
  'workspace:^',
  'customConditions',
  "conditions: ['source']",
  'TURBO_MFE_PORT',
  'FL_DEVTOOLS',
  'GemBackground',
]

/** Excluded from the starter. Checked against package.json only — prose may name them. */
export const BANNED_AS_DEPENDENCY: readonly string[] = ['@three-flatland/devtools', 'tweakpane']
