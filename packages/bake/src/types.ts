/**
 * Contract every baker must satisfy.
 *
 * Bakers are registered by package.json via a `flatland.bakers` field:
 *
 * ```json
 * {
 *   "flatland": {
 *     "bakers": [
 *       { "name": "font", "description": "Bake SlugFont", "entry": "./dist/baker.js" }
 *     ]
 *   }
 * }
 * ```
 *
 * Entry modules must default-export a `Baker`.
 */
export interface Baker {
  /** Subcommand name used on the CLI: `flatland-bake <name> ...` */
  name: string
  /** One-line description shown by `flatland-bake --list`. */
  description: string
  /**
   * Run the baker with the CLI args that follow the subcommand.
   * Resolves to an exit code (0 = success).
   */
  run(args: string[]): Promise<number>
  /** Optional multiline usage string for `flatland-bake <name> --help`. */
  usage?(): string
}

export interface BakerRegistration {
  name: string
  description: string
  entry: string
  /** Package that declared the baker — used in diagnostics. */
  packageName: string
  /** Absolute path on disk the `entry` resolves to. */
  resolvedEntry: string
}

export interface FlatlandManifest {
  bakers?: Array<{
    name: string
    description: string
    entry: string
  }>
}
