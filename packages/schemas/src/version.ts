// Derives the public-URL $id for a schema from the schemas package version.
// Single source of truth: changesets bumps `package.json#version`, and every
// place that needs a schema URL (validator at runtime, sync-docs script at
// build time) reads it from here. Major bumps create a new public URL;
// patch/minor share the existing URL.

import pkg from '../package.json' with { type: 'json' }

export const SCHEMA_BASE_URL = 'https://three-flatland.dev/schemas'

/** Major version of @three-flatland/schemas — drives the public URL slug. */
export const SCHEMA_MAJOR = Number.parseInt(pkg.version.split('.')[0]!, 10)

/** Build the canonical $id URL for a named schema (e.g. atlas → atlas.v1.json). */
export function schemaIdFor(name: string): string {
  return `${SCHEMA_BASE_URL}/${name}.v${SCHEMA_MAJOR}.json`
}

/** Filename portion of the $id, suitable for docs/public/schemas/<here>. */
export function schemaFilenameFor(name: string): string {
  return `${name}.v${SCHEMA_MAJOR}.json`
}
