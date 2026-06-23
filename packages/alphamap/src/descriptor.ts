/**
 * Versioned descriptor for the alpha sidecar. Parameterless — the hash
 * is constant per format version, so `probeBakedSibling` staleness only
 * triggers on a `v` bump. Event-system spec §10.
 *
 * The runtime side (`resolveAlphaMap` in `three-flatland`) re-declares
 * this same literal rather than importing it, so the core has no
 * build-time dependency on this baker package — both sides agree only on
 * the hash computed by `@three-flatland/bake`.
 */
export const ALPHA_DESCRIPTOR = { kind: 'alpha', v: 1 } as const
