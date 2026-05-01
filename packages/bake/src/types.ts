/**
 * Contract every baker must satisfy.
 *
 * Bakers are registered by package.json via a `flatland.bake` field:
 *
 * ```json
 * {
 *   "flatland": {
 *     "bake": [
 *       { "name": "font", "description": "Bake SlugFont", "entry": "./dist/cli.js" }
 *     ]
 *   }
 * }
 * ```
 *
 * Entry modules must default-export a `Baker`. The legacy `flatland.bakers`
 * shape is still accepted for one release with a deprecation warning.
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

export interface FlatlandManifestEntry {
  name: string
  description: string
  entry: string
}

export interface FlatlandManifest {
  /** Current registration shape. */
  bake?: FlatlandManifestEntry[]
  /** @deprecated Legacy shape; use `bake` instead. Accepted for one release. */
  bakers?: FlatlandManifestEntry[]
}

/**
 * Shared option interface for every loader that speaks the
 * "try baked sibling first → fall back to in-memory generation" pattern.
 *
 * Loaders extend this with their asset-specific options:
 *
 * ```ts
 * interface MyLoaderOptions extends BakedAssetLoaderOptions {
 *   // asset-specific fields
 * }
 * ```
 */
export interface BakedAssetLoaderOptions {
  /**
   * Skip the baked-sibling probe. Loader generates in-memory directly
   * (or uses an explicit URL the caller provided). Suppresses the
   * devtime "no baked sibling" warning.
   *
   * Use during asset iteration when you know no baked output exists yet
   * and don't want the probe cost or console noise.
   */
  skipBakedProbe?: boolean
}

/**
 * Metadata stamped into a baked PNG's `tEXt` chunk under the key
 * `flatland`. Read back by `probeBakedSibling` to validate the baked
 * file still matches the descriptor a consumer is about to use.
 */
export interface BakedSidecarMetadata {
  /** Content hash of the descriptor that produced this file. */
  hash: string
  /** Schema version of the metadata format itself. */
  v: 1
}
