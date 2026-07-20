/**
 * Types for leak-guard.mjs.
 *
 * The implementation stays plain ESM so `scripts/consumer-smoke.mjs` can import
 * it with no build step; this sibling gives the vitest suite real types instead
 * of an implicit `any`.
 */

/** Workspace-only wiring that must never appear in any scaffolded file. */
export declare const BANNED_EVERYWHERE: readonly string[]

/** Packages that must not be scaffolded dependencies, though prose may name them. */
export declare const BANNED_AS_DEPENDENCY: readonly string[]
